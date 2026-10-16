import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedDatabase } from './seed';
import {
  canRevertTransfer,
  createInvitation,
  DB_KEY,
  findUsableInvitation,
  getDb,
  invitationStatus,
  registerWithInvitation,
  resendInvitation,
  resetStoreForTest,
  revertTransfer,
  setUserActive,
  syncSessionUser,
  transferAdmin,
} from './store';
import type { Database } from './types';

let seed: Database;
beforeAll(async () => {
  seed = await createSeedDatabase();
});
beforeEach(() => {
  vi.useRealTimers();
  resetStoreForTest(seed);
});

const ADMIN = 'user-admin';
const USER1 = 'user-1';

describe('永続化', () => {
  it('変更は localStorage に保存される', () => {
    createInvitation(ADMIN, '保存の確認', 'saved@example.com');
    const saved = JSON.parse(localStorage.getItem(DB_KEY)!) as Database;
    expect(saved.invitations).toHaveLength(seed.invitations.length + 1);
  });
});

describe('ログイン中のユーザー（API）をストアに入れる', () => {
  const apiUser = { id: 'api-user-1', name: '山田', email: 'yamada@example.com', role: 'officer' as const };

  it('ストアにいなければ足す', () => {
    syncSessionUser(apiUser);
    expect(getDb().users.find((u) => u.id === apiUser.id)).toMatchObject({ name: '山田', role: 'user', isActive: true });
  });

  it('名前や役割が変わっていれば上書きする（同じ ID は1人だけ）', () => {
    syncSessionUser(apiUser);
    syncSessionUser({ ...apiUser, name: '山田太郎', role: 'admin' });
    const matches = getDb().users.filter((u) => u.id === apiUser.id);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ name: '山田太郎', role: 'admin' });
  });

  it('パスワードはストアに保存しない', () => {
    syncSessionUser(apiUser);
    expect(getDb().users.find((u) => u.id === apiUser.id)?.passwordHash).toBe('');
  });

  it('平文のパスワードは保存されない', () => {
    expect(localStorage.getItem(DB_KEY)).not.toContain('admin1234');
  });
});

describe('招待', () => {
  it('UUID トークンと48時間の有効期限で発行される', () => {
    const inv = createInvitation(ADMIN, '山田', 'Yamada@Example.com');
    expect(inv.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(inv.email).toBe('yamada@example.com');
    expect(new Date(inv.expiresAt).getTime() - new Date(inv.invitedAt).getTime()).toBe(48 * 3600 * 1000);
  });

  it('一般ユーザーは招待できない', () => {
    expect(() => createInvitation(USER1, '', 'x@example.com')).toThrow('管理者のみ');
  });

  it('登録済みのアドレスには招待できない', () => {
    expect(() => createInvitation(ADMIN, '', 'user2@example.com')).toThrow('すでに登録');
  });

  it('トークンで登録でき、使用済みになる', async () => {
    const inv = createInvitation(ADMIN, '山田', 'yamada@example.com');
    const user = await registerWithInvitation(inv.token, '山田', 'password1');
    expect(user.role).toBe('user');
    expect(invitationStatus(getDb().invitations.find((i) => i.id === inv.id)!)).toBe('accepted');
    expect(() => findUsableInvitation(inv.token)).toThrow('すでに使用');
  });

  it('期限切れのトークンでは登録できない', async () => {
    const inv = createInvitation(ADMIN, '', 'late@example.com');
    vi.useFakeTimers({ now: new Date(inv.expiresAt).getTime() + 1, toFake: ['Date'] });
    expect(invitationStatus(getDb().invitations[0])).toBe('expired');
    await expect(registerWithInvitation(inv.token, 'late', 'password1')).rejects.toThrow('有効期限');
  });

  it('再送信でトークンが変わり、古いトークンは使えない', () => {
    const inv = createInvitation(ADMIN, '', 'again@example.com');
    const next = resendInvitation(ADMIN, inv.id);
    expect(next.token).not.toBe(inv.token);
    expect(() => findUsableInvitation(inv.token)).toThrow('正しくありません');
    expect(findUsableInvitation(next.token).id).toBe(inv.id);
  });

  it('短いパスワードでは登録できない', async () => {
    const inv = createInvitation(ADMIN, '', 'short@example.com');
    await expect(registerWithInvitation(inv.token, 'a', '123')).rejects.toThrow('8文字以上');
  });
});

describe('管理者移譲', () => {
  it('管理者だけが移譲でき、移譲後は役割が入れ替わる', () => {
    expect(() => transferAdmin(USER1, 'user-2')).toThrow('管理者のみ');
    transferAdmin(ADMIN, USER1);
    const role = (id: string) => getDb().users.find((u) => u.id === id)!.role;
    expect(role(ADMIN)).toBe('user');
    expect(role(USER1)).toBe('admin');
    // 元管理者はもう管理操作できない
    expect(() => createInvitation(ADMIN, '', 'x@example.com')).toThrow('管理者のみ');
  });

  it('取り消しは移譲元本人だけが1時間以内にできる', () => {
    const t = transferAdmin(ADMIN, USER1);
    expect(() => revertTransfer(USER1, t.id)).toThrow('移譲元');
    revertTransfer(ADMIN, t.id);
    const role = (id: string) => getDb().users.find((u) => u.id === id)!.role;
    expect(role(ADMIN)).toBe('admin');
    expect(role(USER1)).toBe('user');
    expect(() => revertTransfer(ADMIN, t.id)).toThrow('取り消せません');
  });

  it('1時間を過ぎると取り消せない', () => {
    const t = transferAdmin(ADMIN, USER1);
    vi.useFakeTimers({ now: new Date(t.revertDeadline).getTime() + 1, toFake: ['Date'] });
    expect(canRevertTransfer(getDb().transfers[0])).toBe(false);
    expect(() => revertTransfer(ADMIN, t.id)).toThrow('期限');
  });

  it('移譲先がさらに移譲していたら取り消せない（管理者が2人にならない）', () => {
    const t = transferAdmin(ADMIN, USER1);
    transferAdmin(USER1, 'user-2');
    expect(() => revertTransfer(ADMIN, t.id)).toThrow();
    expect(getDb().users.filter((u) => u.role === 'admin')).toHaveLength(1);
  });

  it('管理者は無効化できない', () => {
    expect(() => setUserActive(ADMIN, ADMIN, false)).toThrow('管理者は無効化');
  });
});
