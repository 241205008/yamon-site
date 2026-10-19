import type { AdminInvitation, ApiErrorBody, InvitationInfo, IssuedInvitation, MeResponse } from '@yamon/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { sha256 } from '../src/auth/session';
import { schema } from '../src/db/client';
import {
  callApi,
  cookieFrom,
  createUser,
  login,
  setupTestApp,
  TEST_APP_URL,
  tokenFromMail,
  type TestContext,
} from './helpers';

let ctx: TestContext;
let adminUser: Awaited<ReturnType<typeof createUser>>;
let admin: string;
beforeAll(async () => {
  ctx = await setupTestApp();
  adminUser = await createUser(ctx.db, { role: 'admin' });
});
afterAll(() => ctx.close());
// 時刻を進めるテストでは管理者のセッション（8時間）も切れるので、毎回ログインし直す
beforeEach(async () => {
  vi.useRealTimers();
  ctx.sent.length = 0;
  admin = await login(ctx, adminUser.email, adminUser.password);
});

let emailSeq = 0;
const nextEmail = () => `invitee${++emailSeq}@example.com`;

/** 管理者が招待し、応答のリンクのトークンを返す（D46） */
async function invite(email: string, role = 'member') {
  const res = await callApi(ctx, admin, 'POST', '/api/admin/invitations', { email, role });
  expect(res.status).toBe(201);
  const body = (await res.json()) as IssuedInvitation;
  return { id: body.id, token: tokenFromMail(body.url), body, mail: ctx.sent.at(-1)! };
}

const reissue = (id: string, app = ctx.app) =>
  app.request(`/api/admin/invitations/${id}/reissue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin },
    body: '{}',
  });

/** メールを送れない mailer（SMTP の失敗） */
const failingMailer = {
  async send() {
    throw new Error('SMTP error');
  },
};

const lookup = (token: string) => callApi(ctx, undefined, 'POST', '/api/invitations/lookup', { token });
const accept = (token: string, name = '新しい部員', password = 'new-password-1') =>
  callApi(ctx, undefined, 'POST', '/api/invitations/accept', { token, name, password });
const errorCode = async (res: Response) => ((await res.json()) as ApiErrorBody).error.code;

describe('招待から登録まで', () => {
  it('招待すると、48時間有効の登録リンクが応答で返る（管理者が画面からコピーして渡す）', async () => {
    const email = nextEmail();
    const before = Date.now();
    const { body, token } = await invite(email);
    expect(body.url).toBe(`${TEST_APP_URL}/login?invite=${token}`);
    expect(new Date(body.expiresAt).getTime() - before).toBeGreaterThan(47.9 * 60 * 60 * 1000);
    expect(new Date(body.expiresAt).getTime() - before).toBeLessThanOrEqual(48 * 60 * 60 * 1000 + 5000);
  });

  it('メールの設定があれば、相手に同じリンクのメールも届く', async () => {
    const email = nextEmail();
    const { mail, token, body } = await invite(email);
    expect(body.mailSent).toBe(true);
    expect(mail.to).toBe(email);
    expect(mail.subject).toBe('やもんサイトへの招待');
    expect(mail.text).toContain(`${TEST_APP_URL}/login?invite=${token}`);
    expect(mail.text).toContain('48時間');
    // DB にはトークンのハッシュだけを保存する
    const rows = await ctx.db.select().from(schema.invitations).where(eq(schema.invitations.email, email));
    expect(rows[0].tokenHash).toBe(sha256(token));
  });

  it('リンクを開くと、招待されたアドレスと役割が分かる', async () => {
    const email = nextEmail();
    const { token } = await invite(email, 'officer');
    const res = await lookup(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email, role: 'officer' } satisfies Partial<InvitationInfo>);
  });

  it('リンクから名前とパスワードを設定して登録でき、そのままログインした状態になる。招待時の役割になる', async () => {
    const email = nextEmail();
    const { token } = await invite(email, 'viewer');
    const res = await accept(token, '山田 花子');
    expect(res.status).toBe(201);
    const body = (await res.json()) as MeResponse;
    expect(body.user).toMatchObject({ name: '山田 花子', email, role: 'viewer' });
    const me = await callApi(ctx, cookieFrom(res), 'GET', '/api/auth/me');
    expect(((await me.json()) as MeResponse).user?.email).toBe(email);
    // 設定したパスワードでログインできる
    await login(ctx, email, 'new-password-1');
  });

  it('使用済みのリンクでは登録できない', async () => {
    const { token } = await invite(nextEmail());
    expect((await accept(token)).status).toBe(201);
    const again = await accept(token);
    expect(again.status).toBe(410);
    expect(await errorCode(again)).toBe('invitation_used');
    expect(await errorCode(await lookup(token))).toBe('invitation_used');
  });

  it('期限切れ（48時間を過ぎた）のリンクでは登録できない', async () => {
    const { token } = await invite(nextEmail());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 48 * 60 * 60 * 1000 + 1000);
    const res = await accept(token);
    expect(res.status).toBe(410);
    expect(await errorCode(res)).toBe('invitation_expired');
  });

  it('取り消した招待のリンクでは登録できない', async () => {
    const { id, token } = await invite(nextEmail());
    expect((await callApi(ctx, admin, 'POST', `/api/admin/invitations/${id}/revoke`)).status).toBe(200);
    const res = await accept(token);
    expect(res.status).toBe(410);
    expect(await errorCode(res)).toBe('invitation_revoked');
  });

  it('でたらめなトークンは 404', async () => {
    const res = await accept('not-a-real-token');
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('invitation_invalid');
  });

  it('パスワードが短いと 400', async () => {
    const { token } = await invite(nextEmail());
    const res = await accept(token, '名前', 'short');
    expect(res.status).toBe(400);
  });

  it('リンクを作り直すとトークンが変わり、古いリンクは使えない', async () => {
    const { id, token: oldToken } = await invite(nextEmail());
    const res = await reissue(id);
    expect(res.status).toBe(200);
    const newToken = tokenFromMail(((await res.json()) as IssuedInvitation).url);
    // メールの設定があれば、新しいリンクのメールも送る
    expect(tokenFromMail(ctx.sent.at(-1)!.text)).toBe(newToken);
    expect(newToken).not.toBe(oldToken);
    expect((await lookup(oldToken)).status).toBe(404);
    expect((await accept(newToken)).status).toBe(201);
  });

  it('期限切れの招待もリンクを作り直せ、また48時間使える', async () => {
    const { id } = await invite(nextEmail());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 49 * 60 * 60 * 1000);
    admin = await login(ctx, adminUser.email, adminUser.password);
    const res = await reissue(id);
    expect(res.status).toBe(200);
    expect((await accept(tokenFromMail(((await res.json()) as IssuedInvitation).url))).status).toBe(201);
  });

  it('登録済み・取り消し済みの招待は、リンクを作り直せない', async () => {
    const used = await invite(nextEmail());
    expect((await accept(used.token)).status).toBe(201);
    expect((await reissue(used.id)).status).toBe(409);
    const revoked = await invite(nextEmail());
    await callApi(ctx, admin, 'POST', `/api/admin/invitations/${revoked.id}/revoke`);
    expect((await reissue(revoked.id)).status).toBe(409);
  });

  it('同じアドレスに招待し直すと、前の招待は取り消される', async () => {
    const email = nextEmail();
    const first = await invite(email);
    const second = await invite(email);
    expect(await errorCode(await lookup(first.token))).toBe('invitation_revoked');
    expect((await lookup(second.token)).status).toBe(200);
  });

  it('登録済みのアドレスには招待できない（大文字・小文字を区別しない）', async () => {
    const user = await createUser(ctx.db);
    const res = await callApi(ctx, admin, 'POST', '/api/admin/invitations', {
      email: user.email.toUpperCase(),
      role: 'member',
    });
    expect(res.status).toBe(409);
  });

  it('招待の一覧に、状態と招待した人が出る', async () => {
    const email = nextEmail();
    const { id } = await invite(email, 'officer');
    const res = await callApi(ctx, admin, 'GET', '/api/admin/invitations');
    const { invitations } = (await res.json()) as { invitations: AdminInvitation[] };
    expect(invitations.find((i) => i.id === id)).toMatchObject({ email, role: 'officer', status: 'pending' });
  });

  it('メールの設定がなくても招待でき、リンクから登録できる（mailSent は false）', async () => {
    const noMail = createApp({ db: ctx.db, appUrl: TEST_APP_URL });
    const res = await noMail.request('/api/admin/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin },
      body: JSON.stringify({ email: nextEmail(), role: 'member' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as IssuedInvitation;
    expect(body.mailSent).toBe(false);
    expect((await accept(tokenFromMail(body.url))).status).toBe(201);
  });

  it('メールを送れなくても招待は残り、リンクから登録できる（mailSent は false）', async () => {
    const failing = createApp({ db: ctx.db, appUrl: TEST_APP_URL, mailer: failingMailer });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await failing.request('/api/admin/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin },
      body: JSON.stringify({ email: nextEmail(), role: 'member' }),
    });
    consoleError.mockRestore();
    expect(res.status).toBe(201);
    const body = (await res.json()) as IssuedInvitation;
    expect(body.mailSent).toBe(false);
    expect((await accept(tokenFromMail(body.url))).status).toBe(201);
  });

  it('作り直しでメールを送れなくても、新しいリンクは使える', async () => {
    const { id } = await invite(nextEmail());
    const failing = createApp({ db: ctx.db, appUrl: TEST_APP_URL, mailer: failingMailer });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await reissue(id, failing);
    consoleError.mockRestore();
    expect(res.status).toBe(200);
    const body = (await res.json()) as IssuedInvitation;
    expect(body.mailSent).toBe(false);
    expect((await accept(tokenFromMail(body.url))).status).toBe(201);
  });
});
