import type { AdminUser, ApiErrorBody, IssuedLink } from '@yamon/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { schema } from '../src/db/client';
import { parseProtectedUserIds } from '../src/protectedUsers';
import { callApi, createUser, login, setupTestApp, TEST_APP_URL, type TestContext } from './helpers';

// 守るユーザー（PROTECTED_USER_IDS、D51）。守る ID は app を作るときに渡すので、
// 同じ DB を使う「守る設定のある API」（protectedCtx）を別に作る
let base: TestContext;
let protectedCtx: TestContext;
let developer: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  base = await setupTestApp();
  developer = await createUser(base.db, { role: 'admin', name: '開発者' });
  protectedCtx = {
    ...base,
    app: createApp({ db: base.db, appUrl: TEST_APP_URL, protectedUserIds: [developer.id] }),
  };
});
afterAll(() => base.close());

async function otherAdmin(ctx: TestContext) {
  const user = await createUser(ctx.db, { role: 'admin' });
  return { user, cookie: await login(ctx, user.email, user.password) };
}

const errorBody = async (res: Response) => ((await res.json()) as ApiErrorBody).error;

const devRow = async () => (await base.db.select().from(schema.users).where(eq(schema.users.id, developer.id)))[0];

/** ほかの管理者から、守られているユーザーへの4つの操作 */
const operations: [string, string, string, unknown?][] = [
  ['役割の変更（降格）', 'PATCH', 'role', { role: 'member' }],
  ['無効化', 'POST', 'disable'],
  ['退会処理', 'POST', 'withdraw'],
  ['再設定リンクの発行', 'POST', 'password-reset'],
];

describe('守る設定があるとき', () => {
  it.each(operations)('ほかの管理者からの%sは 403 で断られ、何も変わらない', async (_label, method, action, body) => {
    const { cookie } = await otherAdmin(protectedCtx);
    const res = await callApi(protectedCtx, cookie, method, `/api/admin/users/${developer.id}/${action}`, body);
    expect(res.status).toBe(403);
    const error = await errorBody(res);
    expect(error.code).toBe('forbidden');
    expect(error.message).toContain('保護されています');

    const row = await devRow();
    expect(row).toMatchObject({ role: 'admin', status: 'active', email: developer.email });
    expect(await base.db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, developer.id))).toHaveLength(0);
    const logs = await base.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetUserId, developer.id));
    expect(logs).toHaveLength(0);
  });

  it('管理者以外の役割（幹部など）への変更も、管理者への変更以外はすべて断る', async () => {
    const { cookie } = await otherAdmin(protectedCtx);
    for (const role of ['officer', 'member', 'viewer']) {
      const res = await callApi(protectedCtx, cookie, 'PATCH', `/api/admin/users/${developer.id}/role`, { role });
      expect(res.status, role).toBe(403);
    }
    // 同じ役割への変更は、今までどおり何もせず 200
    const same = await callApi(protectedCtx, cookie, 'PATCH', `/api/admin/users/${developer.id}/role`, { role: 'admin' });
    expect(same.status).toBe(200);
  });

  it('本人が自分を降格する操作も断る。本人が自分に再設定リンクを発行するのはできる', async () => {
    const cookie = await login(protectedCtx, developer.email, developer.password);
    const demote = await callApi(protectedCtx, cookie, 'PATCH', `/api/admin/users/${developer.id}/role`, { role: 'member' });
    expect(demote.status).toBe(403);
    expect((await devRow()).role).toBe('admin');

    const reset = await callApi(protectedCtx, cookie, 'POST', `/api/admin/users/${developer.id}/password-reset`);
    expect(reset.status).toBe(201);
    expect(((await reset.json()) as IssuedLink).url).toContain('/reset-password');
    await base.db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, developer.id));
    await base.db.delete(schema.auditLogs).where(eq(schema.auditLogs.targetUserId, developer.id));
  });

  it('守られていないユーザーには、今までどおり4つの操作ができる', async () => {
    const { cookie } = await otherAdmin(protectedCtx);
    const target = await createUser(base.db, { role: 'admin' });
    const ok = async (path: string, method = 'POST', body?: unknown) =>
      (await callApi(protectedCtx, cookie, method, `/api/admin/users/${target.id}/${path}`, body)).status;
    expect(await ok('role', 'PATCH', { role: 'member' })).toBe(200);
    expect(await ok('password-reset')).toBe(201);
    expect(await ok('disable')).toBe(200);
    expect(await ok('enable')).toBe(200);
    expect(await ok('withdraw')).toBe(200);
  });

  it('ユーザーの一覧で、守られている人が分かる', async () => {
    const { cookie } = await otherAdmin(protectedCtx);
    const res = await callApi(protectedCtx, cookie, 'GET', '/api/admin/users');
    const { users } = (await res.json()) as { users: AdminUser[] };
    expect(users.find((u) => u.id === developer.id)?.protected).toBe(true);
    expect(users.filter((u) => u.protected)).toHaveLength(1);
  });
});

describe('守る設定がないとき（開発・テスト・プレビュー）', () => {
  it('今までどおり、ほかの管理者が役割の変更・再設定リンクの発行・無効化・退会処理をできる', async () => {
    const { cookie } = await otherAdmin(base);
    const target = await createUser(base.db, { role: 'admin' });
    const ok = async (path: string, method = 'POST', body?: unknown) =>
      (await callApi(base, cookie, method, `/api/admin/users/${target.id}/${path}`, body)).status;
    expect(await ok('role', 'PATCH', { role: 'officer' })).toBe(200);
    expect(await ok('password-reset')).toBe(201);
    expect(await ok('disable')).toBe(200);
    expect(await ok('enable')).toBe(200);
    expect(await ok('withdraw')).toBe(200);

    const res = await callApi(base, cookie, 'GET', '/api/admin/users');
    const { users } = (await res.json()) as { users: AdminUser[] };
    expect(users.every((u) => !u.protected)).toBe(true);
  });
});

describe('PROTECTED_USER_IDS の読み取り', () => {
  const id1 = '0b7e2f4a-6c1d-4e8f-9a3b-5d2c1e0f4a7b';
  const id2 = '1c8f3a5b-7d2e-4f9a-8b4c-6e3d2f1a5b8c';

  it('未設定・空なら守らない', () => {
    expect(parseProtectedUserIds(undefined)).toEqual([]);
    expect(parseProtectedUserIds('')).toEqual([]);
    expect(parseProtectedUserIds(' , ')).toEqual([]);
  });

  it('カンマ区切りで複数書ける。前後の空白・大文字・重なりは整える', () => {
    expect(parseProtectedUserIds(` ${id1.toUpperCase()} ,${id2},${id1}`)).toEqual([id1, id2]);
  });

  it('UUID でない値があれば例外（書き間違いで守りが外れたまま動かさない）。値はメッセージに出さない', () => {
    expect(() => parseProtectedUserIds(`${id1},developer@example.com`)).toThrow(/UUID）でない値があります（1個）/);
    expect(() => parseProtectedUserIds('developer@example.com')).not.toThrow(/example\.com/);
  });
});
