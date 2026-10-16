import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedDatabase } from './seed';
import {
  addCreature,
  addRecord,
  createEvent,
  DB_KEY,
  deleteCreature,
  deleteRecord,
  getDb,
  resetStoreForTest,
  syncSessionUser,
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

describe('ログイン中のユーザー（API）をストアに入れる', () => {
  const apiUser = { id: 'api-user-1', name: '山田', email: 'yamada@example.com', role: 'officer' as const };

  it('ストアにいなければ足し、記録を追加できるようにする', () => {
    syncSessionUser(apiUser);
    expect(getDb().users.find((u) => u.id === apiUser.id)).toMatchObject({ name: '山田', role: 'user', isActive: true });
    expect(() => addRecord(apiUser.id, baseRecord)).not.toThrow();
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
