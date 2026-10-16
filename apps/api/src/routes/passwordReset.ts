import {
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@yamon/shared';
import { and, count, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { hashPassword } from '../auth/password';
import { newToken, sha256 } from '../auth/session';
import { schema } from '../db/client';
import { errorBody } from '../errors';
import { appOrigin } from '../invitations';
import { validate } from '../validator';

const { users, sessions, passwordResetTokens, loginFailures } = schema;

/**
 * 再設定メールの送りすぎを防ぐ：同じアドレスへの申請は15分に MAX_RESET_REQUESTS 回まで。
 * ログインの失敗と同じ表に、メールアドレスのハッシュに印を付けたキーで数える（D33）。
 * 超えても応答は変えない（登録の有無を漏らさない）。メールを送らないだけ
 */
const RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;
export const MAX_RESET_REQUESTS = 3;
const requestKey = (email: string) => sha256(`password-reset:${email}`);

/** 申請への応答。登録されていてもいなくても同じ（MVP 3章、#5） */
const REQUEST_ACCEPTED = {
  message:
    '登録されているメールアドレスであれば、パスワード再設定のメールを送りました。メールのリンクは1時間有効です。届かない場合は、迷惑メールのフォルダも確認してください',
};

const INVALID_LINK = errorBody(
  'reset_link_invalid',
  'この再設定のリンクは使えません（有効期限の1時間を過ぎたか、すでに使われています）。もう一度、再設定のメールを送ってください',
);

function resetMail(to: string, url: string) {
  return {
    to,
    subject: 'やもんサイトのパスワード再設定',
    text: [
      'やもんサイトのパスワード再設定の申請を受け付けました。',
      `次のリンクを開き、新しいパスワードを設定してください。リンクの有効期限は${PASSWORD_RESET_TTL_MINUTES}分で、1回だけ使えます。`,
      '',
      url,
      '',
      'このメールに心当たりがない場合は、何もせずに削除してください。パスワードは変わりません。',
    ].join('\n'),
  };
}

// トークンは URL のパスに入れない（アクセスログに残さない。D36 と同じ）
export const passwordResetRoutes = new Hono<AppEnv>()
  .post('/request', validate('json', passwordResetRequestSchema), async (c) => {
    const db = c.get('db');
    const { email } = c.req.valid('json');

    // 送りすぎの確認：先に1行記録してから数える（同時に送られてもすり抜けない）
    const key = requestKey(email);
    const windowStart = new Date(Date.now() - RESET_REQUEST_WINDOW_MS);
    await db.delete(loginFailures).where(lte(loginFailures.createdAt, windowStart));
    await db.insert(loginFailures).values({ emailHash: key });
    const [{ requests }] = await db
      .select({ requests: count() })
      .from(loginFailures)
      .where(and(eq(loginFailures.emailHash, key), gt(loginFailures.createdAt, windowStart)));
    if (requests > MAX_RESET_REQUESTS) return c.json(REQUEST_ACCEPTED);

    // 無効化・退会したユーザーには送らない（退会したユーザーはメールアドレスがないので見つからない）
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, eq(users.status, 'active')))
      .limit(1);
    if (!user) return c.json(REQUEST_ACCEPTED);

    const token = newToken();
    await db.transaction(async (tx) => {
      // 前に送ったリンクは使えなくする（最後に届いたメールのリンクだけが使える）
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      await tx.insert(passwordResetTokens).values({
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
      });
    });
    const url = `${appOrigin(c.get('appUrl'), c.req)}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await c.get('mailer').send(resetMail(email, url));
    } catch (err) {
      // 送れなかったことも応答では分からないようにする（登録の有無を漏らさない）。ログで気づく
      console.error(err);
    }
    return c.json(REQUEST_ACCEPTED);
  })

  .post('/confirm', validate('json', passwordResetConfirmSchema), async (c) => {
    const db = c.get('db');
    const { token, password } = c.req.valid('json');
    const tokenHash = sha256(token);

    // 使えるトークンかを先に確かめてから、重いハッシュを計算する
    const now = new Date();
    const usable = and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, now),
    );
    const [found] = await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(usable).limit(1);
    if (!found) return c.json(INVALID_LINK, 400);
    const passwordHash = await hashPassword(password);

    const changed = await db.transaction(async (tx) => {
      // 同じリンクで同時に2回送られても、1回だけ通す（使用済みの印を先に付けた方だけが進む）
      const [used] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(usable)
        .returning({ userId: passwordResetTokens.userId });
      if (!used) return false;
      const [user] = await tx
        .update(users)
        .set({ passwordHash })
        .where(and(eq(users.id, used.userId), eq(users.status, 'active')))
        .returning({ id: users.id, email: users.email });
      if (!user) return false;
      // 再設定したら、そのユーザーのセッションをすべて消す（ほかの端末もログアウトさせる）
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      // ログインの失敗の数え上げも消す（新しいパスワードですぐログインできるように）
      if (user.email) await tx.delete(loginFailures).where(eq(loginFailures.emailHash, sha256(user.email.toLowerCase())));
      return true;
    });
    if (!changed) return c.json(INVALID_LINK, 400);
    return c.json({ message: 'パスワードを変更しました。新しいパスワードでログインしてください' });
  });
