import type { AdminInvitation, ApiErrorBody, InvitationInfo, MeResponse } from '@yamon/shared';
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

/** 管理者が招待し、メールのリンクのトークンを返す */
async function invite(email: string, role = 'member') {
  const res = await callApi(ctx, admin, 'POST', '/api/admin/invitations', { email, role });
  expect(res.status).toBe(201);
  const mail = ctx.sent.at(-1)!;
  return { id: ((await res.json()) as { id: string }).id, token: tokenFromMail(mail.text), mail };
}

const lookup = (token: string) => callApi(ctx, undefined, 'POST', '/api/invitations/lookup', { token });
const accept = (token: string, name = '新しい部員', password = 'new-password-1') =>
  callApi(ctx, undefined, 'POST', '/api/invitations/accept', { token, name, password });
const errorCode = async (res: Response) => ((await res.json()) as ApiErrorBody).error.code;

describe('招待から登録まで', () => {
  it('招待すると、相手に48時間有効の登録リンクのメールが届く', async () => {
    const email = nextEmail();
    const { mail, token } = await invite(email);
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

  it('再送するとトークンが変わり、古いリンクは使えない', async () => {
    const { id, token: oldToken } = await invite(nextEmail());
    const res = await callApi(ctx, admin, 'POST', `/api/admin/invitations/${id}/resend`);
    expect(res.status).toBe(200);
    const newToken = tokenFromMail(ctx.sent.at(-1)!.text);
    expect(newToken).not.toBe(oldToken);
    expect((await lookup(oldToken)).status).toBe(404);
    expect((await accept(newToken)).status).toBe(201);
  });

  it('期限切れの招待も再送でき、また48時間使える', async () => {
    const { id } = await invite(nextEmail());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 49 * 60 * 60 * 1000);
    admin = await login(ctx, adminUser.email, adminUser.password);
    expect((await callApi(ctx, admin, 'POST', `/api/admin/invitations/${id}/resend`)).status).toBe(200);
    expect((await accept(tokenFromMail(ctx.sent.at(-1)!.text))).status).toBe(201);
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

  it('メールを送れなかったら 502 を返し、その招待は取り消す', async () => {
    const failing = createApp({
      db: ctx.db,
      appUrl: TEST_APP_URL,
      mailer: {
        async send() {
          throw new Error('SMTP error');
        },
      },
    });
    const email = nextEmail();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await failing.request('/api/admin/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin },
      body: JSON.stringify({ email, role: 'member' }),
    });
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe('mail_failed');
    const [row] = await ctx.db.select().from(schema.invitations).where(eq(schema.invitations.email, email));
    expect(row.revokedAt).not.toBeNull();
    consoleError.mockRestore();
  });

  it('再送でメールを送れなかったら、古いリンクはそのまま使える', async () => {
    const { id, token } = await invite(nextEmail());
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
    const res = await failing.request(`/api/admin/invitations/${id}/resend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin },
      body: '{}',
    });
    consoleError.mockRestore();
    expect(res.status).toBe(502);
    expect((await lookup(token)).status).toBe(200);
  });
});
