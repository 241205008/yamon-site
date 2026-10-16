import { loginInputSchema, type MeResponse } from '@yamon/shared';
import { and, count, eq, gt, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { getCurrentUser } from '../auth/middleware';
import { verifyDummyPassword, verifyPassword } from '../auth/password';
import {
  clearSessionCookie,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  getSessionToken,
  setSessionCookie,
  sha256,
} from '../auth/session';
import { schema } from '../db/client';
import { errorBody } from '../errors';
import { validate } from '../validator';

const { users, loginFailures } = schema;

/** 同じメールアドレスへのログインの失敗が、この時間に MAX_LOGIN_FAILURES 回を超えたら受け付けない */
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const MAX_LOGIN_FAILURES = 5;

const INVALID_CREDENTIALS = 'メールアドレスまたはパスワードが正しくありません';

export const authRoutes = new Hono<AppEnv>()
  .post('/login', validate('json', loginInputSchema), async (c) => {
    const db = c.get('db');
    const { email, password } = c.req.valid('json');
    const emailHash = sha256(email);
    const windowStart = new Date(Date.now() - LOGIN_FAILURE_WINDOW_MS);

    // 総当たり対策：失敗が続いているアドレスは、パスワードを確かめる前に断る
    await db.delete(loginFailures).where(lte(loginFailures.createdAt, windowStart));
    const [{ failures }] = await db
      .select({ failures: count() })
      .from(loginFailures)
      .where(and(eq(loginFailures.emailHash, emailHash), gt(loginFailures.createdAt, windowStart)));
    if (failures >= MAX_LOGIN_FAILURES) {
      return c.json(
        errorBody('too_many_attempts', 'ログインの失敗が続いたため、一時的にログインできません。15分ほど待ってからやり直してください'),
        429,
      );
    }

    // 退会したユーザーはメールアドレスが null なので、ここでは見つからない
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, passwordHash: users.passwordHash })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : await verifyDummyPassword(password);
    if (!user || !user.email || !ok) {
      await db.insert(loginFailures).values({ emailHash });
      return c.json(errorBody('invalid_credentials', INVALID_CREDENTIALS), 401);
    }
    // 無効化されていることは、パスワードが合っているときだけ伝える
    if (user.status !== 'active') {
      return c.json(errorBody('account_disabled', 'このアカウントは無効化されています。管理者に連絡してください'), 403);
    }

    await db.delete(loginFailures).where(eq(loginFailures.emailHash, emailHash));
    await deleteExpiredSessions(db);
    // ログイン前のセッションは引き継がない（セッション固定攻撃の対策）
    const previous = getSessionToken(c);
    if (previous) await deleteSession(db, previous);
    setSessionCookie(c, await createSession(db, user.id));

    const body: MeResponse = { user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    return c.json(body);
  })
  .post('/logout', async (c) => {
    const token = getSessionToken(c);
    if (token) await deleteSession(c.get('db'), token);
    clearSessionCookie(c);
    return c.body(null, 204);
  })
  // 未ログインでもエラーにせず user: null を返す（画面の起動時に毎回呼ぶため）
  .get('/me', async (c) => {
    const user = await getCurrentUser(c);
    // 期限切れ・無効化などで使えなくなったセッションの Cookie は消しておく
    if (!user && getSessionToken(c)) clearSessionCookie(c);
    const body: MeResponse = { user };
    return c.json(body);
  });
