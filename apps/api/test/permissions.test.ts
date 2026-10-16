import type { ApiErrorBody, Role } from '@yamon/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppEnv } from '../src/app';
import { assertCanActOn, requireAuth, requirePermission } from '../src/auth/middleware';
import { schema } from '../src/db/client';
import { handleError } from '../src/errors';
import { createUser, login, setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
const cookies = {} as Record<Role, string>;
const ids = {} as Record<Role, string>;

// 権限チェックの仕組みだけを確かめるための、テスト用のルート
const app = new Hono<AppEnv>()
  .use(async (c, next) => {
    c.set('db', ctx.db);
    c.set('cookieSecure', true);
    await next();
  })
  .get('/me-only', requireAuth, (c) => c.json({ id: c.get('user').id }))
  .post('/users', requirePermission('users.manage'), (c) => c.json({ ok: true }))
  .post('/records', requirePermission('records.create'), (c) => c.json({ ok: true }))
  .put('/records/:ownerId', requirePermission('records.editOwn'), (c) => {
    assertCanActOn(c.get('user'), c.req.param('ownerId'), 'records.editOwn');
    return c.json({ ok: true });
  })
  .put('/events/:ownerId', requirePermission('events.editOwn'), (c) => {
    assertCanActOn(c.get('user'), c.req.param('ownerId'), 'events.editOwn', 'events.editAny');
    return c.json({ ok: true });
  })
  .onError(handleError);

beforeAll(async () => {
  ctx = await setupTestApp();
  for (const role of ['admin', 'officer', 'member', 'viewer'] as const) {
    const user = await createUser(ctx.db, { role });
    ids[role] = user.id;
    cookies[role] = await login(ctx, user.email, user.password);
  }
});
afterAll(() => ctx.close());

const call = (method: string, path: string, role?: Role) =>
  app.request(path, { method, headers: role ? { cookie: cookies[role] } : {} });

describe('requireAuth', () => {
  it('ログインしていれば通り、c.get("user") で本人を受け取れる', async () => {
    const res = await call('GET', '/me-only', 'member');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ids.member });
  });

  it('未ログインは 401', async () => {
    const res = await call('GET', '/me-only');
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('unauthorized');
  });
});

describe('requirePermission（対応表は packages/shared の PERMISSIONS）', () => {
  it('ユーザー管理は管理者だけ。他の役割は 403、未ログインは 401', async () => {
    expect((await call('POST', '/users', 'admin')).status).toBe(200);
    for (const role of ['officer', 'member', 'viewer'] as const) {
      const res = await call('POST', '/users', role);
      expect(res.status).toBe(403);
      expect(((await res.json()) as ApiErrorBody).error.code).toBe('forbidden');
    }
    expect((await call('POST', '/users')).status).toBe(401);
  });

  it('記録の追加は OB・OG だけ拒否される', async () => {
    for (const role of ['admin', 'officer', 'member'] as const) {
      expect((await call('POST', '/records', role)).status).toBe(200);
    }
    expect((await call('POST', '/records', 'viewer')).status).toBe(403);
  });

  it('無効化されたユーザーは、セッションが残っていても 401', async () => {
    const user = await createUser(ctx.db, { role: 'admin' });
    const cookie = await login(ctx, user.email, user.password);
    await ctx.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));
    expect((await app.request('/users', { method: 'POST', headers: { cookie } })).status).toBe(401);
  });
});

describe('assertCanActOn（作成者本人の判定）', () => {
  it('記録は本人だけ。管理者でも他人の記録は 403', async () => {
    expect((await call('PUT', `/records/${ids.member}`, 'member')).status).toBe(200);
    expect((await call('PUT', `/records/${ids.officer}`, 'member')).status).toBe(403);
    expect((await call('PUT', `/records/${ids.member}`, 'admin')).status).toBe(403);
  });

  it('OB・OG は自分の記録も編集できない', async () => {
    expect((await call('PUT', `/records/${ids.viewer}`, 'viewer')).status).toBe(403);
  });

  it('観察会は作った本人と管理者', async () => {
    expect((await call('PUT', `/events/${ids.member}`, 'member')).status).toBe(200);
    expect((await call('PUT', `/events/${ids.officer}`, 'member')).status).toBe(403);
    expect((await call('PUT', `/events/${ids.member}`, 'admin')).status).toBe(200);
  });
});
