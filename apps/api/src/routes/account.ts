import { emailChangeInputSchema, type EmailChangeResponse, type SessionUser } from '@yamon/shared';
import { and, count, eq, gt, isNull, lte, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, type AuthedEnv } from '../auth/middleware';
import { verifyPassword } from '../auth/password';
import { sha256 } from '../auth/session';
import { schema } from '../db/client';
import { errorBody } from '../errors';
import { trySend } from '../mail';
import { isUniqueViolation } from '../observations/view';
import { validate } from '../validator';
import { LOGIN_FAILURE_WINDOW_MS, MAX_LOGIN_FAILURES } from './auth';

const { users, invitations, auditLogs, loginFailures } = schema;

/**
 * 今のパスワードの入れ間違いの数え上げ。ログインの失敗と同じ表に、ユーザー ID に印を付けたキーで数える（D33・D54）。
 * ログインしたままの端末を使って、パスワードを総当たりで確かめられないようにする
 */
const passwordCheckKey = (userId: string) => sha256(`email-change:${userId}`);

const DUPLICATE = 'このメールアドレスはほかのユーザーが使っています。別のアドレスを入力してください';

function emailChangedMail(to: string) {
  return {
    to,
    subject: 'やもんサイトのログイン用メールアドレスを変更しました',
    text: [
      'やもんサイトのログイン用のメールアドレスを、このアドレスに変更しました。',
      '次からは、このアドレスと今までのパスワードでログインしてください。',
      '',
      'この変更に心当たりがない場合は、サークルの管理者に連絡してください。',
    ].join('\n'),
  };
}

// ログイン中の本人のアカウント。どの役割でも使える（卒業して OB・OG になった人が、大学のアドレスから移すため、#84）
export const accountRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  /**
   * ログイン用のメールアドレスを変える（D54）。本人だけができ、管理者は他人のアドレスを変えられない。
   * 記録・役割・パスワード・ほかの端末のセッションはそのまま。ユーザー ID は変わらないので、
   * 保守担当の保護（D51）や「自分の記録は正確な位置」（D52）もそのまま効く
   */
  .patch('/email', validate('json', emailChangeInputSchema), async (c) => {
    const db = c.get('db');
    const me = c.get('user');
    const { email, currentPassword } = c.req.valid('json');

    // 入れ間違いの回数制限：先に1行記録してから数える（同時に大量に送られても、数える前にすり抜けない）
    const key = passwordCheckKey(me.id);
    const windowStart = new Date(Date.now() - LOGIN_FAILURE_WINDOW_MS);
    await db.delete(loginFailures).where(lte(loginFailures.createdAt, windowStart));
    await db.insert(loginFailures).values({ emailHash: key });
    const [{ attempts }] = await db
      .select({ attempts: count() })
      .from(loginFailures)
      .where(and(eq(loginFailures.emailHash, key), gt(loginFailures.createdAt, windowStart)));
    if (attempts > MAX_LOGIN_FAILURES) {
      return c.json(
        errorBody('too_many_attempts', 'パスワードの入れ間違いが続いたため、一時的に変更できません。15分ほど待ってからやり直してください'),
        429,
      );
    }

    const [current] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id)).limit(1);
    if (!current?.passwordHash || !(await verifyPassword(currentPassword, current.passwordHash))) {
      return c.json(errorBody('invalid_password', '今のパスワードが正しくありません'), 400);
    }
    await db.delete(loginFailures).where(eq(loginFailures.emailHash, key));

    if (email === me.email.toLowerCase()) {
      throw new HTTPException(400, { message: '今と同じメールアドレスです' });
    }

    let user: SessionUser;
    try {
      user = await db.transaction(async (tx) => {
        // 自分の行をロックして読み直す（退会・無効化の操作と重なっても、古い状態で変えない）
        const [target] = await tx.select().from(users).where(eq(users.id, me.id)).limit(1).for('update');
        if (!target || target.status !== 'active' || !target.email) {
          throw new HTTPException(409, { message: 'このアカウントのメールアドレスは変えられません' });
        }
        // ほかのユーザーとは、大文字・小文字を区別せずに比べる（D30）。退会したユーザーはアドレスがないので当たらない。
        // ここをすり抜けて同時に同じアドレスへ変えられても、DB の一意の制約で片方が失敗する（下の catch）
        const [taken] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(sql`lower(${users.email}) = ${email}`, ne(users.id, me.id)))
          .limit(1);
        if (taken) throw new HTTPException(409, { message: DUPLICATE });

        const [row] = await tx
          .update(users)
          .set({ email })
          .where(eq(users.id, me.id))
          .returning({ id: users.id, name: users.name, role: users.role });
        // 古いアドレスの招待は消す。古いアドレスが空くので、残っている招待で別の人が登録できないようにし、
        // 退会処理（今のアドレスの招待を消す、D26）で古いアドレスが残らないようにする
        await tx.delete(invitations).where(sql`lower(${invitations.email}) = lower(${target.email})`);
        // 新しいアドレス宛てのまだ使われていない招待は取り消す（使おうとしても「登録済み」で断られるため）
        await tx
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(and(sql`lower(${invitations.email}) = ${email}`, isNull(invitations.usedAt), isNull(invitations.revokedAt)));
        // 誰が・いつ・誰のアドレスを変えたかだけ残し、アドレスの値は残さない（個人情報を増やさない、D54）
        await tx.insert(auditLogs).values({ actorId: me.id, targetUserId: me.id, action: 'email_changed' });
        return { ...row, email };
      });
    } catch (err) {
      // 同時に同じアドレスへ変えられたとき、DB の一意の制約（users_email_unique）で片方が失敗する
      if (isUniqueViolation(err)) throw new HTTPException(409, { message: DUPLICATE });
      throw err;
    }

    // メールの設定があれば、新しいアドレスに通知する（確認のクリックは求めない。送れなくても変更は取り消さない、D54）
    const mailSent = await trySend(c.get('mailer'), emailChangedMail(email));
    return c.json({ user, mailSent } satisfies EmailChangeResponse);
  });
