import type { Role } from '@yamon/shared';
import { createApp, type AppDeps } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { connectPglite, schema, type Db } from '../src/db/client';
import { createMemoryMailer } from '../src/mail';

export const TEST_APP_URL = 'https://yamon.example.test';

/**
 * メモリ上の PGlite にマイグレーションを流した DB と、それを使う API を作る。
 * メールは送らずに sent にためる（deps.mailer を渡したときはそちらを使う）
 */
export async function setupTestApp(deps: Omit<AppDeps, 'db'> = {}) {
  const handle = await connectPglite();
  const { mailer, sent } = createMemoryMailer();
  const app = createApp({ db: handle.db, mailer, appUrl: TEST_APP_URL, ...deps });
  return { app, db: handle.db, close: handle.close, sent };
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

/** ログイン済みの Cookie を付けて JSON の API を呼ぶ */
export function callApi(ctx: TestContext, cookie: string | undefined, method: string, path: string, body?: unknown) {
  const hasBody = method !== 'GET';
  return ctx.app.request(path, {
    method,
    headers: { ...(hasBody ? jsonHeaders : {}), ...(cookie ? { cookie } : {}) },
    body: hasBody ? JSON.stringify(body ?? {}) : undefined,
  });
}

/** 招待リンク（メールの本文、または API の応答の url）からトークンを取り出す */
export function tokenFromMail(text: string): string {
  const match = /\/login\?invite=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) throw new Error(`招待リンクがありません：${text}`);
  return match[1];
}
