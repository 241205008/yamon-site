import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  type PasswordResetAvailability,
} from '@yamon/shared';
import { and, count, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { hashPassword } from '../auth/password';
import { sha256 } from '../auth/session';
import { schema } from '../db/client';
import { errorBody } from '../errors';
import { trySend } from '../mail';
import { issueResetToken, resetMail, resetUrl } from '../passwordResetLinks';
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
  'この再設定のリンクは使えません（有効期限の1時間を過ぎたか、すでに使われています）。新しいリンクを受け取ってください',
);

// トークンは URL のパスに入れない（アクセスログに残さない。D36 と同じ）
export const passwordResetRoutes = new Hono<AppEnv>()
  /** 本人がメールで再設定を申請できるか。メールの設定がなければ、画面は「管理者に連絡」と案内する（D46） */
  .get('/', (c) => c.json({ selfService: c.get('mailer') !== undefined } satisfies PasswordResetAvailability))

  .post('/request', validate('json', passwordResetRequestSchema), async (c) => {
    const db = c.get('db');
    const mailer = c.get('mailer');
    // メールを送れない環境では受け付けない。登録の有無とは関係なく同じ応答なので、登録の有無は漏れない
    if (!mailer) {
      return c.json(
        errorBody('mail_unavailable', 'メールでの再設定は使えません。管理者に、パスワード再設定のリンクを発行してもらってください'),
        503,
      );
    }
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

    const { token } = await db.transaction((tx) => issueResetToken(tx, user.id));
    // 送れなかったことも応答では分からないようにする（登録の有無を漏らさない）。ログで気づく
    await trySend(mailer, resetMail(email, resetUrl(c.get('appUrl'), c.req, token)));
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
