import type { Role } from '@yamon/shared';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { connectPglite, schema, type Db } from '../src/db/client';

/** メモリ上の PGlite にマイグレーションを流した DB と、それを使う API を作る */
export async function setupTestApp() {
  const handle = await connectPglite();
  const app = createApp({ db: handle.db });
  return { app, db: handle.db, close: handle.close };
}

export type TestContext = Awaited<ReturnType<typeof setupTestApp>>;

let userSeq = 0;

/** テスト用のユーザーを作る。パスワードは options.password（既定 'password123'） */
export async function createUser(
  db: Db,
  options: { email?: string; password?: string; role?: Role; name?: string } = {},
) {
  userSeq += 1;
  const password = options.password ?? 'password123';
  const [user] = await db
    .insert(schema.users)
    .values({
      name: options.name ?? `ユーザー${userSeq}`,
      email: options.email ?? `user${userSeq}@example.com`,
      passwordHash: await hashPassword(password),
      role: options.role ?? 'member',
    })
    .returning();
  return { ...user, email: user.email!, password };
}

export const jsonHeaders = { 'content-type': 'application/json' };

/** Set-Cookie から「名前=値」だけを取り出し、次のリクエストの Cookie ヘッダーにする */
export function cookieFrom(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

/** ログインして、セッションの Cookie ヘッダー（"yamon_session=..."）を返す */
export async function login(ctx: TestContext, email: string, password: string) {
  const res = await ctx.app.request('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`ログインに失敗しました：${res.status} ${await res.text()}`);
  return cookieFrom(res);
}
