import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SESSION_MAX_AGE_SECONDS, type SessionUser } from '@yamon/shared';
import { eq, lte } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../app';
import { schema, type Db } from '../db/client';

const { sessions, users } = schema;

export const SESSION_COOKIE = 'yamon_session';

/** トークン（Cookie の値・招待・再設定）の SHA-256。DB にはこれだけを保存する（D18） */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** 秘密の値を比べる。長さの違いや一致した文字数で時間が変わらないよう、ハッシュにそろえてから比べる */
export function sameSecret(input: string, expected: string) {
  return timingSafeEqual(Buffer.from(sha256(input), 'hex'), Buffer.from(sha256(expected), 'hex'));
}

/** 推測できない乱数のトークン（256 ビット） */
export const newToken = () => randomBytes(32).toString('base64url');

/** セッションを作り、Cookie に入れるトークンを返す。期限は作った時点から8時間（延長しない） */
export async function createSession(db: Db, userId: string): Promise<string> {
  const token = newToken();
  await db.insert(sessions).values({
    idHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });
  return token;
}

/** 期限切れのセッションをまとめて消す（ログインのたびに呼ぶ。sessions_expires_at_idx を使う） */
export async function deleteExpiredSessions(db: Db) {
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.idHash, sha256(token)));
}

/**
 * Cookie のトークンからログイン中のユーザーを探す。毎回 DB のユーザーの状態と役割を読むので、
 * 無効化・退会・役割の変更は、セッションが残っていても次のリクエストから効く
 */
export async function findSessionUser(db: Db, token: string): Promise<SessionUser | null> {
  const idHash = sha256(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.idHash, idHash))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now() || row.status !== 'active' || row.email === null) {
    await db.delete(sessions).where(eq(sessions.idHash, idHash));
    return null;
  }
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export function getSessionToken(c: Context<AppEnv>): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/** HttpOnly（スクリプトから読めない）・SameSite=Lax（他のサイトからの送信に付かない）・Secure（HTTPS のみ）、D18 */
export function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.get('cookieSecure'),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: c.get('cookieSecure'), httpOnly: true, sameSite: 'Lax' });
}
