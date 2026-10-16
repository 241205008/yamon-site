import type { ApiErrorBody, MeResponse, SetupStatus } from '@yamon/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../src/db/client';
import { MAX_SETUP_ATTEMPTS } from '../src/routes/setup';
import { callApi, cookieFrom, createUser, jsonHeaders, setupTestApp, type TestContext } from './helpers';

const SETUP_TOKEN = 'test-setup-token-0123456789abcdef';

let ctx: TestContext | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

const input = (overrides: Record<string, string> = {}) => ({
  token: SETUP_TOKEN,
  name: '代表',
  email: 'Leader@Example.com',
  password: 'first-admin-pass',
  ...overrides,
});

const status = async (c: TestContext) =>
  ((await (await callApi(c, undefined, 'GET', '/api/setup')).json()) as SetupStatus).needed;
const available = async (c: TestContext) =>
  ((await (await callApi(c, undefined, 'GET', '/api/setup')).json()) as SetupStatus).available;
const errorCode = async (res: Response) => ((await res.json()) as ApiErrorBody).error.code;

describe('初回セットアップ', () => {
  it('ユーザーが0人のとき、正しいトークンで最初の管理者を登録でき、そのままログインした状態になる', async () => {
    ctx = await setupTestApp({ setupToken: SETUP_TOKEN });
    expect(await status(ctx)).toBe(true);

    const res = await callApi(ctx, undefined, 'POST', '/api/setup', input());
    expect(res.status).toBe(201);
    const body = (await res.json()) as MeResponse;
    expect(body.user).toMatchObject({ name: '代表', email: 'leader@example.com', role: 'admin' });

    const me = await callApi(ctx, cookieFrom(res), 'GET', '/api/auth/me');
    expect(((await me.json()) as MeResponse).user?.role).toBe('admin');
    // 設定したパスワードでログインできる
    const login = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'leader@example.com', password: 'first-admin-pass' }),
    });
    expect(login.status).toBe(200);
    expect(await status(ctx)).toBe(false);
  });

  it('トークンが違うと 403 で、ユーザーは作られない', async () => {
    ctx = await setupTestApp({ setupToken: SETUP_TOKEN });
    const res = await callApi(ctx, undefined, 'POST', '/api/setup', input({ token: 'wrong-token' }));
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('invalid_setup_token');
    expect(await ctx.db.select().from(schema.users)).toHaveLength(0);
  });

  it('ユーザーが1人以上いると、正しいトークンでも 409', async () => {
    ctx = await setupTestApp({ setupToken: SETUP_TOKEN });
    await createUser(ctx.db, { role: 'member' });
    expect(await status(ctx)).toBe(false);
    const res = await callApi(ctx, undefined, 'POST', '/api/setup', input());
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('setup_done');
  });

  it('2回目のセットアップは 409（同時に送っても管理者は1人だけ）', async () => {
    ctx = await setupTestApp({ setupToken: SETUP_TOKEN });
    const results = await Promise.all([
      callApi(ctx, undefined, 'POST', '/api/setup', input({ email: 'a@example.com' })),
      callApi(ctx, undefined, 'POST', '/api/setup', input({ email: 'b@example.com' })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ctx.db.select().from(schema.users)).toHaveLength(1);
  });

  it(`トークンの試行は15分に${MAX_SETUP_ATTEMPTS}回まで。超えると正しいトークンでも 429`, async () => {
    ctx = await setupTestApp({ setupToken: SETUP_TOKEN });
    for (let i = 0; i < MAX_SETUP_ATTEMPTS; i++) {
      expect((await callApi(ctx, undefined, 'POST', '/api/setup', input({ token: `wrong-${i}` }))).status).toBe(403);
    }
    const res = await callApi(ctx, undefined, 'POST', '/api/setup', input());
    expect(res.status).toBe(429);
    expect(await ctx.db.select().from(schema.users)).toHaveLength(0);
  });

  it('サーバーに SETUP_TOKEN がなければ 503（だれも管理者になれない）。状態にも出る', async () => {
    ctx = await setupTestApp();
    expect(await available(ctx)).toBe(false);
    const res = await callApi(ctx, undefined, 'POST', '/api/setup', input());
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe('setup_unavailable');
    expect(await ctx.db.select().from(schema.users)).toHaveLength(0);
  });

  it('パスワードが短いと 400', async () => {
    ctx = await setupTestApp({ setupToken: SETUP_TOKEN });
    const res = await callApi(ctx, undefined, 'POST', '/api/setup', input({ password: 'short' }));
    expect(res.status).toBe(400);
  });
});
