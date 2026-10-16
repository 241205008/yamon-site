import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedDatabase } from './seed';
import {
  addCreature,
  addRecord,
  canRevertTransfer,
  createEvent,
  createInvitation,
  DB_KEY,
  deleteCreature,
  deleteRecord,
  findUsableInvitation,
  getDb,
  getSessionUser,
  invitationStatus,
  login,
  registerWithInvitation,
  resendInvitation,
  resetStoreForTest,
  revertTransfer,
  setUserActive,
  StoreError,
  transferAdmin,
  updateCreature,
  updateRecord,
  type RecordInput,
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

const baseRecord: RecordInput = {
  creatureId: 'cr-yamori',
  eventId: null,
  locationType: 'main',
  mainLocationId: 'loc-central-park',
  otherLocationName: '',
  lat: null,
  lng: null,
  date: '2026-05-01',
  time: '09:00',
  memo: '',
};

describe('永続化', () => {
  it('変更は localStorage に保存される', () => {
    addRecord(USER1, baseRecord);
    const saved = JSON.parse(localStorage.getItem(DB_KEY)!) as Database;
    expect(saved.records).toHaveLength(seed.records.length + 1);
  });
});

describe('ログイン', () => {
  it('正しいパスワードでログインでき、セッションが保存される', async () => {
    const user = await login('ADMIN@example.com ', 'admin1234');
    expect(user.id).toBe(ADMIN);
    expect(getSessionUser()?.id).toBe(ADMIN);
    expect(localStorage.getItem('yamon:session')).toContain(ADMIN);
  });

  it('パスワードが違うと失敗する', async () => {
    await expect(login('admin@example.com', 'wrong')).rejects.toThrow(StoreError);
  });

  it('無効化されたユーザーはログインできず、既存セッションも無効になる', async () => {
    await login('user1@example.com', 'user1234');
    setUserActive(ADMIN, USER1, false);
    expect(getSessionUser()).toBeNull();
    await expect(login('user1@example.com', 'user1234')).rejects.toThrow('無効化');
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
    expect(getSessionUser()?.id).toBe(user.id);
    expect(invitationStatus(getDb().invitations.find((i) => i.id === inv.id)!)).toBe('accepted');
    expect(() => findUsableInvitation(inv.token)).toThrow('すでに使用');
    await expect(login('yamada@example.com', 'password1')).resolves.toBeTruthy();
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

describe('観察記録', () => {
  it('主な場所で詳細座標がなければ主な場所の座標になる', () => {
    const r = addRecord(USER1, baseRecord);
    expect(r).toMatchObject({ locationName: '中央公園', lat: 35.127, lng: 136.9671, userId: USER1 });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('場所を指定しない記録は座標を持たない', () => {
    const r = addRecord(USER1, { ...baseRecord, locationType: 'none', mainLocationId: null });
    expect(r.lat).toBeNull();
    expect(r.locationName).toBe('');
  });

  it('他人の記録は編集・削除できない', () => {
    const r = addRecord(USER1, baseRecord);
    expect(() => updateRecord(ADMIN, r.id, baseRecord)).toThrow('自分の記録');
    expect(() => deleteRecord(ADMIN, r.id)).toThrow('自分の記録');
    deleteRecord(USER1, r.id);
    expect(getDb().records.some((x) => x.id === r.id)).toBe(false);
  });

  it('編集しても観察会との紐付けは変わらない', () => {
    const r = addRecord(USER1, { ...baseRecord, eventId: 'ev-summer-forest' });
    updateRecord(USER1, r.id, { ...baseRecord, eventId: null, memo: '更新' });
    expect(getDb().records.find((x) => x.id === r.id)).toMatchObject({ eventId: 'ev-summer-forest', memo: '更新' });
  });

  it('4県の範囲外の座標は追加・編集できない', () => {
    const tokyo = { ...baseRecord, locationType: 'other' as const, mainLocationId: null, lat: 35.6812, lng: 139.7671 };
    expect(() => addRecord(USER1, tokyo)).toThrow('範囲外');
    expect(() => addRecord(USER1, { ...baseRecord, lat: 35.6812, lng: 139.7671 })).toThrow('範囲外');
    expect(() => addRecord(USER1, { ...tokyo, lat: 35.1, lng: null })).toThrow('範囲外');
    const r = addRecord(USER1, baseRecord);
    expect(() => updateRecord(USER1, r.id, tokyo)).toThrow('範囲外');
    expect(addRecord(USER1, { ...tokyo, lat: null, lng: null }).lat).toBeNull();
  });

  it('生き物が未選択だとエラー', () => {
    expect(() => addRecord(USER1, { ...baseRecord, creatureId: '' })).toThrow('生き物を選択');
  });
});

describe('生き物', () => {
  it('改名は ID 参照なので既存記録に反映される', () => {
    updateCreature(USER1, 'cr-yamori', { name: 'ニホンヤモリ', category: 'アクア', memo: '' });
    const r = getDb().records.find((x) => x.id === 'rec-1')!;
    expect(getDb().creatures.find((c) => c.id === r.creatureId)?.name).toBe('ニホンヤモリ');
  });

  it('同じ名前は登録できない', () => {
    expect(() => addCreature(USER1, { name: 'ヤモリ', category: 'アクア', memo: '' })).toThrow('すでに登録');
  });

  it('記録がある生き物は削除できないが、記録のない生き物は削除できる', () => {
    expect(() => deleteCreature(USER1, 'cr-yamori')).toThrow('削除できません');
    const c = addCreature(USER1, { name: 'カナヘビ', category: 'アクア', memo: '' });
    deleteCreature(USER1, c.id);
    expect(getDb().creatures.some((x) => x.id === c.id)).toBe(false);
  });
});

describe('観察会', () => {
  it('主な場所で作成すると座標が入る', () => {
    const ev = createEvent(USER1, {
      name: ' 秋の観察会 ',
      mainLocationId: 'loc-pond-square',
      otherLocationName: '',
      lat: null,
      lng: null,
      date: '2026-10-01',
      time: '09:00',
    });
    expect(ev).toMatchObject({ name: '秋の観察会', locationName: '池のある広場', lat: 35.1188, createdBy: USER1 });
  });

  it('4県の範囲外の座標では作成できない', () => {
    expect(() =>
      createEvent(USER1, {
        name: '東京の観察会',
        mainLocationId: null,
        otherLocationName: '皇居',
        lat: 35.6852,
        lng: 139.7528,
        date: '2026-10-01',
        time: '09:00',
      }),
    ).toThrow('範囲外');
  });

  it('場所がないと作成できない', () => {
    expect(() =>
      createEvent(USER1, { name: 'x', mainLocationId: null, otherLocationName: ' ', lat: null, lng: null, date: '2026-10-01', time: '09:00' }),
    ).toThrow('場所');
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
