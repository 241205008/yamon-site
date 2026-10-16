import type { ApiErrorBody, MeResponse } from '@yamon/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../src/auth/session';
import { schema } from '../src/db/client';
import { MAX_LOGIN_FAILURES } from '../src/routes/auth';
import { cookieFrom, createUser, jsonHeaders, login, setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  vi.useRealTimers();
  await ctx.db.delete(schema.loginFailures);
});

const postLogin = (body: unknown, headers: Record<string, string> = {}) =>
  ctx.app.request('/api/auth/login', {
    method: 'POST',
    headers: { ...jsonHeaders, ...headers },
    body: JSON.stringify(body),
  });

const me = async (cookie?: string) => {
  const res = await ctx.app.request('/api/auth/me', { headers: cookie ? { cookie } : {} });
  return { res, body: (await res.json()) as MeResponse };
};

const errorCode = async (res: Response) => ((await res.json()) as ApiErrorBody).error.code;

describe('POST /api/auth/login', () => {
  it('正しいメールアドレスとパスワードでログインでき、HttpOnly・SameSite=Lax・Secure・8時間の Cookie が付く', async () => {
    const user = await createUser(ctx.db, { email: 'Login.OK@example.com', role: 'officer' });
    // 大文字・前後の空白があっても同じアドレスとして扱う
    const res = await postLogin({ email: '  login.ok@EXAMPLE.com ', password: user.password });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: user.id, name: user.name, email: 'Login.OK@example.com', role: 'officer' },
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^yamon_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=28800');
    expect(setCookie).toContain('Path=/');
  });

  it('ログイン後は Cookie で GET /api/auth/me が自分を返す（再読み込みしてもログインが続く）', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    const { res, body } = await me(cookie);
    expect(res.status).toBe(200);
    expect(body.user?.id).toBe(user.id);
  });

  it('パスワードが違うと 401（登録されていないアドレスと同じ応答）', async () => {
    const user = await createUser(ctx.db);
    const wrong = await postLogin({ email: user.email, password: 'wrong-password' });
    const unknown = await postLogin({ email: 'nobody@example.com', password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const wrongBody = (await wrong.json()) as ApiErrorBody;
    expect(wrongBody.error.code).toBe('invalid_credentials');
    expect(await unknown.json()).toEqual(wrongBody);
    expect(wrong.headers.get('set-cookie')).toBeNull();
  });

  it('無効化されたユーザーは、パスワードが合っていても 403（理由を返す）', async () => {
    const user = await createUser(ctx.db);
    await ctx.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));
    const res = await postLogin({ email: user.email, password: user.password });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('account_disabled');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('入力の形が違うと 400', async () => {
    const res = await postLogin({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_error');
  });

  it(`同じアドレスへの失敗が ${MAX_LOGIN_FAILURES} 回続くと、正しいパスワードでも 429`, async () => {
    const user = await createUser(ctx.db);
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      expect((await postLogin({ email: user.email, password: 'wrong-password' })).status).toBe(401);
    }
    const res = await postLogin({ email: user.email, password: user.password });
    expect(res.status).toBe(429);
    expect(await errorCode(res)).toBe('too_many_attempts');
    // 他のアドレスには影響しない
    const other = await createUser(ctx.db);
    expect((await postLogin({ email: other.email, password: other.password })).status).toBe(200);
  });

  it('同時に大量に送られても、制限の回数を超えて試せない', async () => {
    const user = await createUser(ctx.db);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => postLogin({ email: user.email, password: 'wrong-password' })),
    );
    const statuses = results.map((r) => r.status);
    // パスワードを確かめるのは最大で MAX_LOGIN_FAILURES 回まで（残りは 429）
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(MAX_LOGIN_FAILURES);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(12 - MAX_LOGIN_FAILURES);
  });

  it('失敗から15分たてば、またログインできる', async () => {
    const user = await createUser(ctx.db);
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) await postLogin({ email: user.email, password: 'wrong-password' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1000);
    expect((await postLogin({ email: user.email, password: user.password })).status).toBe(200);
  });

  it('ログインに成功すると、それまでの失敗の数え上げは消える', async () => {
    const user = await createUser(ctx.db);
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) await postLogin({ email: user.email, password: 'wrong-password' });
    await login(ctx, user.email, user.password);
    expect(await ctx.db.select().from(schema.loginFailures)).toHaveLength(0);
  });

  it('ログイン前のセッションは、ログインすると消える（セッション固定の対策）', async () => {
    const user = await createUser(ctx.db);
    const first = await login(ctx, user.email, user.password);
    const res = await postLogin({ email: user.email, password: user.password }, { cookie: first });
    expect(res.status).toBe(200);
    expect((await me(first)).body.user).toBeNull();
    expect((await me(cookieFrom(res))).body.user?.id).toBe(user.id);
  });

  it('JSON 以外の本文は 415（CSRF 対策）', async () => {
    const res = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a%40example.com&password=x',
    });
    expect(res.status).toBe(415);
    expect(await errorCode(res)).toBe('unsupported_media_type');
  });
});

describe('DB に平文を残さない', () => {
  it('パスワードは Argon2id のハッシュ、セッションは Cookie の値の SHA-256 だけを保存する', async () => {
    const user = await createUser(ctx.db, { password: 'plain-text-password' });
    const cookie = await login(ctx, user.email, user.password);
    const token = cookie.split('=')[1];

    const [row] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(row.passwordHash).not.toContain('plain-text-password');

    const sessions = await ctx.db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id));
    expect(sessions.map((s) => s.idHash)).toEqual([sha256(token)]);
    expect(sessions[0].idHash).not.toBe(token);
  });
});

describe('セッションが使えなくなる場合', () => {
  it('Cookie がなければ user: null', async () => {
    expect((await me()).body).toEqual({ user: null });
  });

  it('でたらめな Cookie は user: null', async () => {
    expect((await me('yamon_session=forged')).body).toEqual({ user: null });
  });

  it('8時間を過ぎたセッションは使えず、DB からも消える', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1000);
    const { res, body } = await me(cookie);
    expect(body.user).toBeNull();
    // 使えなくなった Cookie は消す指示を返す
    expect(res.headers.get('set-cookie')).toMatch(/^yamon_session=;.*Max-Age=0/);
    const rows = await ctx.db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it('ログイン中に無効化されると、次のリクエストから拒否される', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    await ctx.db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));
    expect((await me(cookie)).body.user).toBeNull();
  });

  it('ログイン中に退会（匿名化）させられると、次のリクエストから拒否される', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    await ctx.db
      .update(schema.users)
      .set({ status: 'withdrawn', name: '退会済みユーザー', email: null, passwordHash: null, withdrawnAt: new Date() })
      .where(eq(schema.users.id, user.id));
    expect((await me(cookie)).body.user).toBeNull();
  });

  it('役割の変更は、次のリクエストから反映される', async () => {
    const user = await createUser(ctx.db, { role: 'member' });
    const cookie = await login(ctx, user.email, user.password);
    await ctx.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, user.id));
    expect((await me(cookie)).body.user?.role).toBe('viewer');
  });
});

describe('POST /api/auth/logout', () => {
  it('セッションを消し、Cookie を消す指示を返す。以後その Cookie は使えない', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx, user.email, user.password);
    const res = await ctx.app.request('/api/auth/logout', { method: 'POST', headers: { ...jsonHeaders, cookie } });
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toMatch(/^yamon_session=;.*Max-Age=0/);
    expect((await me(cookie)).body.user).toBeNull();
  });

  it('ログインしていなくてもエラーにしない', async () => {
    const res = await ctx.app.request('/api/auth/logout', { method: 'POST', headers: jsonHeaders });
    expect(res.status).toBe(204);
  });
});
