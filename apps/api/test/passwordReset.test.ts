import type { ApiErrorBody, AuditLogEntry, IssuedLink, MeResponse, PasswordResetAvailability } from '@yamon/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { sha256 } from '../src/auth/session';
import { schema } from '../src/db/client';
import { MAX_RESET_REQUESTS } from '../src/routes/passwordReset';
import { callApi, createUser, jsonHeaders, login, setupTestApp, TEST_APP_URL, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  vi.useRealTimers();
  ctx.sent.length = 0;
  await ctx.db.delete(schema.loginFailures);
});

const request = (email: string) => callApi(ctx, undefined, 'POST', '/api/password-reset/request', { email });
const confirm = (token: string, password = 'brand-new-pass') =>
  callApi(ctx, undefined, 'POST', '/api/password-reset/confirm', { token, password });
const loginStatus = async (email: string, password: string) => {
  const res = await ctx.app.request('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  return res.status;
};
const errorCode = async (res: Response) => ((await res.json()) as ApiErrorBody).error.code;

/** 最後に送られた再設定メールのリンクからトークンを取り出す */
function tokenFromLastMail() {
  const mail = ctx.sent.at(-1);
  const match = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? '');
  if (!match) throw new Error(`再設定のリンクがありません：${mail?.text}`);
  return match[1];
}

describe('再設定メールの申請', () => {
  it('登録されたアドレスには、1時間有効のリンクのメールが届く（DB にはハッシュだけ）', async () => {
    const user = await createUser(ctx.db);
    const res = await request(user.email.toUpperCase());
    expect(res.status).toBe(200);
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0].to).toBe(user.email);
    expect(ctx.sent[0].subject).toBe('やもんサイトのパスワード再設定');
    expect(ctx.sent[0].text).toContain(`${TEST_APP_URL}/reset-password?token=`);
    expect(ctx.sent[0].text).toContain('60分');
    const token = tokenFromLastMail();
    const [row] = await ctx.db
      .select()
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.userId, user.id));
    expect(row.tokenHash).toBe(sha256(token));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(59 * 60 * 1000);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(61 * 60 * 1000);
  });

  it('未登録のアドレスでも、応答は登録済みのときと同じ（メールは送らない）', async () => {
    const user = await createUser(ctx.db);
    const known = await request(user.email);
    const unknown = await request('nobody-here@example.com');
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(ctx.sent.map((m) => m.to)).toEqual([user.email]);
  });

  it('無効化されたユーザーには送らない（応答は同じ）', async () => {
    const user = await createUser(ctx.db);
    await ctx.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));
    expect((await request(user.email)).status).toBe(200);
    expect(ctx.sent).toHaveLength(0);
  });

  it(`同じアドレスへの申請は15分に${MAX_RESET_REQUESTS}回まで（超えても応答は同じで、メールは送らない）`, async () => {
    const user = await createUser(ctx.db);
    for (let i = 0; i < MAX_RESET_REQUESTS + 2; i++) expect((await request(user.email)).status).toBe(200);
    expect(ctx.sent).toHaveLength(MAX_RESET_REQUESTS);
  });

  it('新しく申請すると、前のメールのリンクは使えなくなる', async () => {
    const user = await createUser(ctx.db);
    await request(user.email);
    const first = tokenFromLastMail();
    await request(user.email);
    const second = tokenFromLastMail();
    expect((await confirm(first)).status).toBe(400);
    expect((await confirm(second)).status).toBe(200);
  });

  it('メールを送れなくても、応答は同じ', async () => {
    const user = await createUser(ctx.db);
    const failing = createApp({
      db: ctx.db,
      appUrl: TEST_APP_URL,
      mailer: {
        async send() {
          throw new Error('SMTP error');
        },
      },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await failing.request('/api/password-reset/request', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: user.email }),
    });
    consoleError.mockRestore();
    expect(res.status).toBe(200);
  });
});

describe('新しいパスワードの設定', () => {
  it('リンクから新しいパスワードを設定でき、新しいパスワードでログインでき、古いパスワードではできない', async () => {
    const user = await createUser(ctx.db, { password: 'old-password-1' });
    await request(user.email);
    const res = await confirm(tokenFromLastMail(), 'new-password-1');
    expect(res.status).toBe(200);
    expect(await loginStatus(user.email, 'new-password-1')).toBe(200);
    expect(await loginStatus(user.email, 'old-password-1')).toBe(401);
  });

  it('再設定すると、そのユーザーの既存のセッションはすべて使えなくなる', async () => {
    const user = await createUser(ctx.db);
    const cookieA = await login(ctx, user.email, user.password);
    await request(user.email);
    await confirm(tokenFromLastMail());
    const me = await callApi(ctx, cookieA, 'GET', '/api/auth/me');
    expect(((await me.json()) as MeResponse).user).toBeNull();
  });

  it('使用済みのリンクでは再設定できない', async () => {
    const user = await createUser(ctx.db);
    await request(user.email);
    const token = tokenFromLastMail();
    expect((await confirm(token)).status).toBe(200);
    const again = await confirm(token, 'another-pass-2');
    expect(again.status).toBe(400);
    expect(await errorCode(again)).toBe('reset_link_invalid');
  });

  it('期限切れ（1時間を過ぎた）のリンクでは再設定できない', async () => {
    const user = await createUser(ctx.db);
    await request(user.email);
    const token = tokenFromLastMail();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1000);
    const res = await confirm(token);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('reset_link_invalid');
  });

  it('でたらめなトークンは 400、短いパスワードは 400', async () => {
    expect((await confirm('not-a-real-token')).status).toBe(400);
    const user = await createUser(ctx.db);
    await request(user.email);
    const res = await confirm(tokenFromLastMail(), 'short');
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_error');
  });

  it('同じリンクで同時に2回送っても、変更は1回だけ', async () => {
    const user = await createUser(ctx.db);
    await request(user.email);
    const token = tokenFromLastMail();
    const results = await Promise.all([confirm(token, 'parallel-pass-a'), confirm(token, 'parallel-pass-b')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('リンクを送った後に無効化されたユーザーは、再設定できない', async () => {
    const user = await createUser(ctx.db);
    await request(user.email);
    const token = tokenFromLastMail();
    await ctx.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));
    expect((await confirm(token)).status).toBe(400);
  });
});

describe('メールの設定がないとき（D46）', () => {
  it('本人の申請は受け付けず 503 を返し、画面には「管理者に連絡」と出せるよう selfService: false を返す', async () => {
    const noMail = createApp({ db: ctx.db, appUrl: TEST_APP_URL });
    const user = await createUser(ctx.db);
    const availability = await noMail.request('/api/password-reset');
    expect((await availability.json()) as PasswordResetAvailability).toEqual({ selfService: false });
    const res = await noMail.request('/api/password-reset/request', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: user.email }),
    });
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe('mail_unavailable');
    // 未登録のアドレスでも同じ応答（登録の有無を漏らさない）
    const unknown = await noMail.request('/api/password-reset/request', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'nobody-here@example.com' }),
    });
    expect(unknown.status).toBe(503);
  });

  it('メールの設定があれば selfService: true', async () => {
    const res = await ctx.app.request('/api/password-reset');
    expect((await res.json()) as PasswordResetAvailability).toEqual({ selfService: true });
  });
});

describe('管理者が再設定のリンクを発行する（D46）', () => {
  const issue = async (cookie: string, userId: string, app = ctx.app) =>
    app.request(`/api/admin/users/${userId}/password-reset`, {
      method: 'POST',
      headers: { ...jsonHeaders, cookie },
      body: '{}',
    });
  const tokenFromUrl = (url: string) => new URL(url).searchParams.get('token')!;

  it('発行したリンクで本人が再設定でき、新しいパスワードでログインできる。操作履歴に残る', async () => {
    const adminUser = await createUser(ctx.db, { role: 'admin' });
    const admin = await login(ctx, adminUser.email, adminUser.password);
    const user = await createUser(ctx.db, { password: 'old-password-1' });
    const res = await issue(admin, user.id);
    expect(res.status).toBe(201);
    const body = (await res.json()) as IssuedLink;
    expect(body.url).toContain(`${TEST_APP_URL}/reset-password?token=`);
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
    // メールの設定があれば、本人にも送る
    expect(body.mailSent).toBe(true);
    expect(ctx.sent.at(-1)!.to).toBe(user.email);
    expect((await confirm(tokenFromUrl(body.url), 'new-password-1')).status).toBe(200);
    expect(await loginStatus(user.email, 'new-password-1')).toBe(200);

    const logs = await callApi(ctx, admin, 'GET', '/api/admin/audit-logs');
    const { auditLogs } = (await logs.json()) as { auditLogs: AuditLogEntry[] };
    expect(auditLogs[0]).toMatchObject({ action: 'password_reset_issued', actorName: adminUser.name, targetName: user.name });
  });

  it('メールの設定がなくても発行でき（mailSent: false）、前に渡したリンクは使えなくなる', async () => {
    const adminUser = await createUser(ctx.db, { role: 'admin' });
    const admin = await login(ctx, adminUser.email, adminUser.password);
    const user = await createUser(ctx.db);
    const noMail = createApp({ db: ctx.db, appUrl: TEST_APP_URL });
    const first = (await (await issue(admin, user.id, noMail)).json()) as IssuedLink;
    const second = (await (await issue(admin, user.id, noMail)).json()) as IssuedLink;
    expect(second.mailSent).toBe(false);
    expect((await confirm(tokenFromUrl(first.url))).status).toBe(400);
    expect((await confirm(tokenFromUrl(second.url))).status).toBe(200);
  });

  it('無効化・退会したユーザーには発行できない（409）', async () => {
    const adminUser = await createUser(ctx.db, { role: 'admin' });
    const admin = await login(ctx, adminUser.email, adminUser.password);
    const user = await createUser(ctx.db);
    await ctx.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));
    expect((await issue(admin, user.id)).status).toBe(409);
  });

  it('管理者でなければ発行できない（403）', async () => {
    const officer = await createUser(ctx.db, { role: 'officer' });
    const cookie = await login(ctx, officer.email, officer.password);
    const user = await createUser(ctx.db);
    expect((await issue(cookie, user.id)).status).toBe(403);
  });
});
