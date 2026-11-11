import type { ApiErrorBody, AuditLogEntry, EmailChangeResponse, MeResponse } from '@yamon/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { schema } from '../src/db/client';
import { MAX_LOGIN_FAILURES } from '../src/routes/auth';
import { callApi, createUser, jsonHeaders, login, setupTestApp, TEST_APP_URL, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  ctx.sent.length = 0;
  await ctx.db.delete(schema.loginFailures);
});

const changeEmail = (cookie: string | undefined, email: string, currentPassword: string, c: TestContext = ctx) =>
  callApi(c, cookie, 'PATCH', '/api/account/email', { email, currentPassword });
const errorCode = async (res: Response) => ((await res.json()) as ApiErrorBody).error.code;
const loginStatus = async (email: string, password: string) =>
  (
    await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email, password }),
    })
  ).status;
const me = async (cookie: string) => ((await (await callApi(ctx, cookie, 'GET', '/api/auth/me')).json()) as MeResponse).user;

describe('ログイン用のメールアドレスの変更（本人、#84）', () => {
  it('変えた後は新しいアドレスでログインでき、古いアドレスではできない。ID・役割・記録はそのまま', async () => {
    const user = await createUser(ctx.db, { role: 'officer' });
    const [creature] = await ctx.db.insert(schema.creatures).values({ name: 'カワセミ', category: 'バーダー' }).returning();
    await ctx.db
      .insert(schema.observationRecords)
      .values({ userId: user.id, creatureId: creature.id, locationType: 'none', date: '2026-04-01', time: '09:00' });
    const cookie = await login(ctx, user.email, user.password);

    const res = await changeEmail(cookie, '  New.Address@Example.COM ', user.password);
    expect(res.status).toBe(200);
    const body = (await res.json()) as EmailChangeResponse;
    // 前後の空白を除き、小文字にそろえる（登録と同じ、D30）
    expect(body.user).toEqual({ id: user.id, name: user.name, email: 'new.address@example.com', role: 'officer' });

    expect(await loginStatus(user.email, user.password)).toBe(401);
    expect(await loginStatus('new.address@example.com', user.password)).toBe(200);
    // 今の端末のセッションはそのまま使え、新しいアドレスが見える
    expect((await me(cookie))?.email).toBe('new.address@example.com');
    const records = await ctx.db.select().from(schema.observationRecords).where(eq(schema.observationRecords.userId, user.id));
    expect(records).toHaveLength(1);
  });

  it('ほかの端末のセッションは消さない（D54）', async () => {
    const user = await createUser(ctx.db);
    const first = await login(ctx, user.email, user.password);
    const second = await login(ctx, user.email, user.password);
    expect((await changeEmail(first, 'kept-sessions@example.com', user.password)).status).toBe(200);
    expect((await me(second))?.email).toBe('kept-sessions@example.com');
  });

  it('OB・OG も変えられる（卒業した人が大学のアドレスから移すため）', async () => {
    const user = await createUser(ctx.db, { role: 'viewer' });
    const cookie = await login(ctx, user.email, user.password);
    expect((await changeEmail(cookie, 'alumni-private@example.com', user.password)).status).toBe(200);
  });

  it('ほかのユーザーと同じアドレスには、大文字・小文字が違っても変えられない', async () => {
    const other = await createUser(ctx.db, { email: 'taken@example.com' });
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    const res = await changeEmail(cookie, 'TAKEN@example.com', user.password);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('conflict');
    expect(await loginStatus(user.email, user.password)).toBe(200);
    expect(await loginStatus(other.email, other.password)).toBe(200);
  });

  it('2人が同時に同じアドレスへ変えても、片方だけが通る', async () => {
    const a = await createUser(ctx.db);
    const b = await createUser(ctx.db);
    const [ca, cb] = [await login(ctx, a.email, a.password), await login(ctx, b.email, b.password)];
    const results = await Promise.all([
      changeEmail(ca, 'race@example.com', a.password),
      changeEmail(cb, 'race@example.com', b.password),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const owners = await ctx.db.select().from(schema.users).where(eq(schema.users.email, 'race@example.com'));
    expect(owners).toHaveLength(1);
  });

  it('形式が正しくないアドレスは 400', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    for (const email of ['not-an-email', '', 'a@b']) {
      const res = await changeEmail(cookie, email, user.password);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('validation_error');
    }
  });

  it('今と同じアドレスは 400', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    expect((await changeEmail(cookie, user.email.toUpperCase(), user.password)).status).toBe(400);
  });

  it('今のパスワードが違うと変えられない。入れ間違いが続くと、正しいパスワードでも 429', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      const res = await changeEmail(cookie, 'wrong-pass@example.com', 'wrong-password');
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('invalid_password');
    }
    const res = await changeEmail(cookie, 'wrong-pass@example.com', user.password);
    expect(res.status).toBe(429);
    expect(await loginStatus(user.email, user.password)).toBe(200);
  });

  it('ログインしていなければ 401', async () => {
    const res = await changeEmail(undefined, 'anon@example.com', 'password123');
    expect(res.status).toBe(401);
  });

  it('無効化・退会したユーザーは変えられない（セッションが残っていても）', async () => {
    const disabled = await createUser(ctx.db);
    const c1 = await login(ctx, disabled.email, disabled.password);
    await ctx.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, disabled.id));
    expect((await changeEmail(c1, 'disabled-new@example.com', disabled.password)).status).toBe(401);

    const withdrawn = await createUser(ctx.db);
    const c2 = await login(ctx, withdrawn.email, withdrawn.password);
    await ctx.db
      .update(schema.users)
      .set({ status: 'withdrawn', email: null, passwordHash: null, withdrawnAt: new Date() })
      .where(eq(schema.users.id, withdrawn.id));
    expect((await changeEmail(c2, 'withdrawn-new@example.com', withdrawn.password)).status).toBe(401);
  });

  it('管理者が他人のアドレスを変える API はない（変えられるのは自分のアドレスだけ）', async () => {
    const admin = await createUser(ctx.db, { role: 'admin' });
    const target = await createUser(ctx.db);
    const cookie = await login(ctx, admin.email, admin.password);
    const res = await callApi(ctx, cookie, 'PATCH', `/api/admin/users/${target.id}/email`, { email: 'hijack@example.com' });
    expect(res.status).toBe(404);
    // 本文にユーザー ID を入れても、変わるのはログイン中の本人のアドレス
    await callApi(ctx, cookie, 'PATCH', '/api/account/email', {
      email: 'admin-own@example.com',
      currentPassword: admin.password,
      userId: target.id,
    });
    expect(await loginStatus(target.email, target.password)).toBe(200);
    expect(await loginStatus('admin-own@example.com', admin.password)).toBe(200);
  });

  it('保守担当（D51）も、自分のアドレスは変えられる', async () => {
    const dev = await createUser(ctx.db, { role: 'admin' });
    const handle = await setupTestApp({ protectedUserIds: [dev.id] });
    try {
      const [row] = await handle.db
        .insert(schema.users)
        .values({ id: dev.id, name: dev.name, email: dev.email, passwordHash: dev.passwordHash!, role: 'admin' })
        .returning();
      const cookie = await login(handle, row.email!, dev.password);
      expect((await changeEmail(cookie, 'dev-new@example.com', dev.password, handle)).status).toBe(200);
    } finally {
      await handle.close();
    }
  });

  it('操作履歴に「メールアドレスの変更」を残し、アドレスの値は残さない', async () => {
    const admin = await createUser(ctx.db, { role: 'admin' });
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    expect((await changeEmail(cookie, 'audited@example.com', user.password)).status).toBe(200);

    const rows = await ctx.db
      .select()
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.targetUserId, user.id), eq(schema.auditLogs.action, 'email_changed')));
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBe(user.id);
    expect(JSON.stringify(rows[0])).not.toContain('@');

    const adminCookie = await login(ctx, admin.email, admin.password);
    const logs = (await (await callApi(ctx, adminCookie, 'GET', '/api/admin/audit-logs')).json()) as {
      auditLogs: AuditLogEntry[];
    };
    const entry = logs.auditLogs.find((l) => l.action === 'email_changed' && l.targetName === user.name);
    expect(entry).toMatchObject({ actorName: user.name, fromRole: null, toRole: null });
  });

  it('古いアドレスの招待は消え、新しいアドレス宛ての使われていない招待は取り消される', async () => {
    const admin = await createUser(ctx.db, { role: 'admin' });
    const user = await createUser(ctx.db);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await ctx.db.insert(schema.invitations).values([
      { tokenHash: `old-${user.id}`, email: user.email, role: 'member', invitedBy: admin.id, expiresAt, usedAt: new Date() },
      { tokenHash: `new-${user.id}`, email: 'Pending-Invite@example.com', role: 'member', invitedBy: admin.id, expiresAt },
    ]);
    const cookie = await login(ctx, user.email, user.password);
    expect((await changeEmail(cookie, 'pending-invite@example.com', user.password)).status).toBe(200);

    const invs = await ctx.db.select().from(schema.invitations).where(eq(schema.invitations.invitedBy, admin.id));
    expect(invs.map((i) => i.email)).toEqual(['Pending-Invite@example.com']);
    expect(invs[0].revokedAt).not.toBeNull();
  });

  it('メールの設定があれば、新しいアドレスに通知を送る', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    const res = await changeEmail(cookie, 'notified@example.com', user.password);
    expect(((await res.json()) as EmailChangeResponse).mailSent).toBe(true);
    expect(ctx.sent.map((m) => m.to)).toEqual(['notified@example.com']);
    expect(ctx.sent[0].text).not.toContain(user.email);
  });

  it('メールの設定がなくても変更はでき、mailSent は false', async () => {
    const handle = await setupTestApp();
    const app = createApp({ db: handle.db, appUrl: TEST_APP_URL });
    const noMail = { ...handle, app };
    try {
      const user = await createUser(handle.db);
      const cookie = await login(noMail, user.email, user.password);
      const res = await changeEmail(cookie, 'no-mail@example.com', user.password, noMail);
      expect(res.status).toBe(200);
      expect(((await res.json()) as EmailChangeResponse).mailSent).toBe(false);
    } finally {
      await handle.close();
    }
  });
});
