import type { AdminUser, ApiErrorBody, AuditLogEntry, MeResponse, Role } from '@yamon/shared';
import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../src/db/client';
import { callApi, createUser, jsonHeaders, login, setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(() => ctx.close());

/** 有効な管理者の人数 */
async function activeAdmins() {
  const [{ n }] = await ctx.db
    .select({ n: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, 'admin'), eq(schema.users.status, 'active')));
  return n;
}

/** 管理者を1人作ってログインする（テストごとに、他の管理者と独立させる） */
async function adminSession() {
  const user = await createUser(ctx.db, { role: 'admin' });
  return { user, cookie: await login(ctx, user.email, user.password) };
}

const errorCode = async (res: Response) => ((await res.json()) as ApiErrorBody).error.code;

const loginStatus = async (email: string, password: string) => {
  const res = await ctx.app.request('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  return res.status;
};

describe('管理者以外は使えない', () => {
  const endpoints: [string, string, unknown?][] = [
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/invitations'],
    ['GET', '/api/admin/audit-logs'],
    ['POST', '/api/admin/invitations', { email: 'x@example.com', role: 'member' }],
    ['PATCH', '/api/admin/users/00000000-0000-4000-8000-000000000000/role', { role: 'admin' }],
    ['POST', '/api/admin/users/00000000-0000-4000-8000-000000000000/disable'],
    ['POST', '/api/admin/users/00000000-0000-4000-8000-000000000000/enable'],
    ['POST', '/api/admin/users/00000000-0000-4000-8000-000000000000/withdraw'],
    ['POST', '/api/admin/invitations/00000000-0000-4000-8000-000000000000/resend'],
    ['POST', '/api/admin/invitations/00000000-0000-4000-8000-000000000000/revoke'],
  ];

  it.each(['officer', 'member', 'viewer'] as Role[])('%s は 403', async (role) => {
    const user = await createUser(ctx.db, { role });
    const cookie = await login(ctx, user.email, user.password);
    for (const [method, path, body] of endpoints) {
      const res = await callApi(ctx, cookie, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('未ログインは 401', async () => {
    for (const [method, path, body] of endpoints) {
      expect((await callApi(ctx, undefined, method, path, body)).status, `${method} ${path}`).toBe(401);
    }
  });
});

describe('役割の変更', () => {
  it('管理者／幹部／部員／OB・OG に変えられ、操作履歴に残る', async () => {
    const { user: actor, cookie } = await adminSession();
    const target = await createUser(ctx.db, { role: 'member' });
    for (const role of ['officer', 'viewer', 'admin', 'member'] as Role[]) {
      const res = await callApi(ctx, cookie, 'PATCH', `/api/admin/users/${target.id}/role`, { role });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { user: AdminUser }).user.role).toBe(role);
    }
    const res = await callApi(ctx, cookie, 'GET', '/api/admin/audit-logs');
    const { auditLogs } = (await res.json()) as { auditLogs: AuditLogEntry[] };
    const mine = auditLogs.filter((l) => l.targetName === target.name);
    expect(mine.map((l) => [l.fromRole, l.toRole])).toEqual([
      ['admin', 'member'],
      ['viewer', 'admin'],
      ['officer', 'viewer'],
      ['member', 'officer'],
    ]);
    expect(mine.every((l) => l.action === 'role_changed' && l.actorName === actor.name)).toBe(true);
  });

  it('OB・OG にしたユーザーは、ログインして見られるが、役割は viewer になる', async () => {
    const { cookie } = await adminSession();
    const target = await createUser(ctx.db, { role: 'member' });
    const targetCookie = await login(ctx, target.email, target.password);
    await callApi(ctx, cookie, 'PATCH', `/api/admin/users/${target.id}/role`, { role: 'viewer' });
    const me = (await (await callApi(ctx, targetCookie, 'GET', '/api/auth/me')).json()) as MeResponse;
    expect(me.user?.role).toBe('viewer');
  });

  it('同じ役割への変更は、何もせず履歴にも残さない', async () => {
    const { cookie } = await adminSession();
    const target = await createUser(ctx.db, { role: 'member' });
    await callApi(ctx, cookie, 'PATCH', `/api/admin/users/${target.id}/role`, { role: 'member' });
    const logs = await ctx.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetUserId, target.id));
    expect(logs).toHaveLength(0);
  });

  it('存在しない役割は 400、存在しないユーザーは 404', async () => {
    const { cookie } = await adminSession();
    const target = await createUser(ctx.db);
    expect((await callApi(ctx, cookie, 'PATCH', `/api/admin/users/${target.id}/role`, { role: 'owner' })).status).toBe(400);
    expect(
      (await callApi(ctx, cookie, 'PATCH', '/api/admin/users/00000000-0000-4000-8000-000000000000/role', { role: 'member' }))
        .status,
    ).toBe(404);
  });
});

describe('最後の1人の管理者を守る', () => {
  /** このブロックの中だけ、有効な管理者を指定の人数にする（他のテストで作った管理者は無効化しておく） */
  async function onlyAdmins(n: number) {
    await ctx.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.role, 'admin'));
    const sessions = [];
    for (let i = 0; i < n; i++) sessions.push(await adminSession());
    return sessions;
  }

  it('管理者が1人のとき、その人は降格できない（自分で自分を降格する場合も）', async () => {
    const [a] = await onlyAdmins(1);
    const res = await callApi(ctx, a.cookie, 'PATCH', `/api/admin/users/${a.user.id}/role`, { role: 'member' });
    expect(res.status).toBe(409);
    expect(await activeAdmins()).toBe(1);
  });

  it('管理者が2人なら、1人を降格できる。残った1人は降格できない', async () => {
    const [a, b] = await onlyAdmins(2);
    expect((await callApi(ctx, a.cookie, 'PATCH', `/api/admin/users/${b.user.id}/role`, { role: 'officer' })).status).toBe(200);
    expect((await callApi(ctx, a.cookie, 'PATCH', `/api/admin/users/${a.user.id}/role`, { role: 'member' })).status).toBe(409);
  });

  it('2人の管理者が同時に互いを降格しようとしても、管理者は0人にならない', async () => {
    const [a, b] = await onlyAdmins(2);
    const results = await Promise.all([
      callApi(ctx, a.cookie, 'PATCH', `/api/admin/users/${b.user.id}/role`, { role: 'member' }),
      callApi(ctx, b.cookie, 'PATCH', `/api/admin/users/${a.user.id}/role`, { role: 'member' }),
    ]);
    expect(results.map((r) => r.status).filter((s) => s === 200)).toHaveLength(1);
    expect(await activeAdmins()).toBe(1);
  });

  it('2人の管理者が同時に互いを無効化・退会させようとしても、管理者は0人にならない', async () => {
    const [a, b] = await onlyAdmins(2);
    await Promise.all([
      callApi(ctx, a.cookie, 'POST', `/api/admin/users/${b.user.id}/disable`),
      callApi(ctx, b.cookie, 'POST', `/api/admin/users/${a.user.id}/withdraw`),
    ]);
    expect(await activeAdmins()).toBe(1);
  });
});

describe('無効化・有効化', () => {
  it('無効化するとログインできず、セッションも使えなくなる。有効化すると戻る。どちらも履歴に残る', async () => {
    const { cookie } = await adminSession();
    const target = await createUser(ctx.db);
    const targetCookie = await login(ctx, target.email, target.password);

    const res = await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/disable`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: AdminUser }).user.status).toBe('disabled');
    expect(((await (await callApi(ctx, targetCookie, 'GET', '/api/auth/me')).json()) as MeResponse).user).toBeNull();
    expect(await loginStatus(target.email, target.password)).toBe(403);

    expect((await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/enable`)).status).toBe(200);
    expect(await loginStatus(target.email, target.password)).toBe(200);

    const logs = await ctx.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetUserId, target.id));
    expect(logs.map((l) => l.action).sort()).toEqual(['disabled', 'enabled']);
  });

  it('自分自身は無効化できない（400）', async () => {
    const { user, cookie } = await adminSession();
    await adminSession();
    const res = await callApi(ctx, cookie, 'POST', `/api/admin/users/${user.id}/disable`);
    expect(res.status).toBe(400);
  });

  it('すでに無効化されている人の無効化、有効な人の有効化は 409', async () => {
    const { cookie } = await adminSession();
    const target = await createUser(ctx.db);
    expect((await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/enable`)).status).toBe(409);
    await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/disable`);
    expect((await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/disable`)).status).toBe(409);
  });
});

describe('退会処理（匿名化）', () => {
  it('ログインできず、名前とメールアドレスが残らず、記録は「退会済みユーザー」の記録として残る', async () => {
    const { cookie } = await adminSession();
    const target = await createUser(ctx.db, { name: '退会する人' });
    const targetCookie = await login(ctx, target.email, target.password);
    // 退会前に登録した記録
    const [creature] = await ctx.db
      .insert(schema.creatures)
      .values({ name: `テストの生き物${target.id}`, category: 'インセクター' })
      .returning();
    const [record] = await ctx.db
      .insert(schema.observationRecords)
      .values({ creatureId: creature.id, locationType: 'none', date: '2026-10-16', time: '10:00', userId: target.id })
      .returning();
    // 招待にもメールアドレスが残っている
    const admin = await createUser(ctx.db, { role: 'admin' });
    await ctx.db.insert(schema.invitations).values({
      tokenHash: `hash-${target.id}`,
      email: target.email,
      invitedBy: admin.id,
      expiresAt: new Date(),
      usedAt: new Date(),
    });

    const res = await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/withdraw`);
    expect(res.status).toBe(200);

    expect(await loginStatus(target.email, target.password)).toBe(401);
    expect(((await (await callApi(ctx, targetCookie, 'GET', '/api/auth/me')).json()) as MeResponse).user).toBeNull();

    const [row] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, target.id));
    expect(row).toMatchObject({ name: '退会済みユーザー', email: null, passwordHash: null, status: 'withdrawn' });
    const invitations = await ctx.db.select().from(schema.invitations).where(eq(schema.invitations.email, target.email));
    expect(invitations).toHaveLength(0);

    const [kept] = await ctx.db
      .select({ id: schema.observationRecords.id, recorder: schema.users.name })
      .from(schema.observationRecords)
      .innerJoin(schema.users, eq(schema.observationRecords.userId, schema.users.id))
      .where(eq(schema.observationRecords.id, record.id));
    expect(kept).toEqual({ id: record.id, recorder: '退会済みユーザー' });

    const logs = await ctx.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetUserId, target.id));
    expect(logs.map((l) => l.action)).toEqual(['withdrawn']);
  });

  it('退会は元に戻せない（有効化・役割の変更・もう一度の退会は 409）', async () => {
    const { cookie } = await adminSession();
    const target = await createUser(ctx.db);
    await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/withdraw`);
    expect((await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/enable`)).status).toBe(409);
    expect((await callApi(ctx, cookie, 'PATCH', `/api/admin/users/${target.id}/role`, { role: 'member' })).status).toBe(409);
    expect((await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/withdraw`)).status).toBe(409);
  });

  it('自分自身は退会させられない（400）', async () => {
    const { user, cookie } = await adminSession();
    const res = await callApi(ctx, cookie, 'POST', `/api/admin/users/${user.id}/withdraw`);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('bad_request');
  });
});

describe('ユーザーの一覧', () => {
  it('退会したユーザーも含め、状態と役割が分かる', async () => {
    const { cookie } = await adminSession();
    const target = await createUser(ctx.db);
    await callApi(ctx, cookie, 'POST', `/api/admin/users/${target.id}/withdraw`);
    const res = await callApi(ctx, cookie, 'GET', '/api/admin/users');
    const { users } = (await res.json()) as { users: AdminUser[] };
    expect(users.find((u) => u.id === target.id)).toMatchObject({
      name: '退会済みユーザー',
      email: null,
      status: 'withdrawn',
    });
  });
});
