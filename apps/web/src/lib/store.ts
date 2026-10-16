import { useSyncExternalStore } from 'react';
import { findMainLocation, isInSurveyArea, type SessionUser } from '@yamon/shared';
import { createSeedDatabase } from './seed';
import type {
  Category,
  Creature,
  Database,
  LocationType,
  ObservationEvent,
  ObservationRecord,
  User,
} from './types';

export const DB_KEY = 'yamon:db:v1';


/** 画面にそのまま表示できるメッセージを持つエラー */
export class StoreError extends Error {}

// ---------------------------------------------------------------------------
// 状態と購読
// ---------------------------------------------------------------------------

let db: Database | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDb(): Database {
  if (!db) throw new Error('store is not initialized');
  return db;
}

/** localStorage から読み込む。なければデモデータを作って保存する */
export async function initStore(): Promise<void> {
  let loaded: Database | null = null;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) loaded = JSON.parse(raw) as Database;
  } catch {
    loaded = null;
  }
  if (!loaded || loaded.version !== 1) {
    loaded = await createSeedDatabase();
    localStorage.setItem(DB_KEY, JSON.stringify(loaded));
  }
  db = loaded;

  if (typeof window !== 'undefined') {
    // 別タブでの変更を反映する
    window.addEventListener('storage', (e) => {
      if (e.key === DB_KEY && e.newValue) {
        db = JSON.parse(e.newValue) as Database;
        emit();
      }
    });
  }
  emit();
}

/** テスト用：任意のデータで初期化する */
export function resetStoreForTest(data: Database) {
  db = structuredClone(data);
  localStorage.clear();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function commit(next: Database) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(next));
  } catch {
    throw new StoreError(
      'ブラウザの保存容量の上限に達したため保存できませんでした。管理者に連絡してください。',
    );
  }
  db = next;
  emit();
}

export function useDb(): Database {
  return useSyncExternalStore(subscribe, getDb);
}

// ---------------------------------------------------------------------------
// ログイン中のユーザー（ログインは API で行う。lib/auth.ts）
// ---------------------------------------------------------------------------

/**
 * API でログインしたユーザーを、このストアのユーザー一覧にも入れる（#13 で記録などを API に移すまでのつなぎ）。
 * ストアの操作は actorId で本人を確かめ、記録者の名前もここから引くため
 */
export function syncSessionUser(user: SessionUser) {
  const d = getDb();
  const role = user.role === 'admin' ? 'admin' : 'user';
  const existing = d.users.find((u) => u.id === user.id);
  if (existing && existing.name === user.name && existing.email === user.email && existing.role === role && existing.isActive) {
    return;
  }
  const next: User = {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    isActive: true,
    // パスワードは API だけが持つ
    passwordHash: '',
    passwordSalt: '',
    createdAt: existing?.createdAt ?? nowIso(),
  };
  const others = d.users.filter((u) => u.id !== user.id);
  commit({ ...d, users: [...others, next] });
}

// ---------------------------------------------------------------------------
// 操作者の検証
// ---------------------------------------------------------------------------

function requireUser(actorId: string): User {
  const user = getDb().users.find((u) => u.id === actorId);
  if (!user || !user.isActive) throw new StoreError('ログインし直してください');
  return user;
}

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// 生き物
// ---------------------------------------------------------------------------

export interface CreatureInput {
  name: string;
  category: Category;
  memo: string;
}

function validateCreature(input: CreatureInput, exceptId?: string): CreatureInput {
  const name = input.name.trim();
  if (!name) throw new StoreError('生き物の名前を入力してください');
  if (getDb().creatures.some((c) => c.name === name && c.id !== exceptId)) {
    throw new StoreError(`「${name}」はすでに登録されています`);
  }
  return { name, category: input.category, memo: input.memo.trim() };
}

export function addCreature(actorId: string, input: CreatureInput): Creature {
  requireUser(actorId);
  const creature: Creature = { id: crypto.randomUUID(), ...validateCreature(input) };
  const d = getDb();
  commit({ ...d, creatures: [...d.creatures, creature] });
  return creature;
}

/** 記録は creatureId で参照しているので、改名はそのまま既存記録に反映される */
export function updateCreature(actorId: string, id: string, input: CreatureInput) {
  requireUser(actorId);
  const valid = validateCreature(input, id);
  const d = getDb();
  commit({ ...d, creatures: d.creatures.map((c) => (c.id === id ? { ...c, ...valid } : c)) });
}

export function deleteCreature(actorId: string, id: string) {
  requireUser(actorId);
  const d = getDb();
  const used = d.records.filter((r) => r.creatureId === id).length;
  if (used > 0) {
    throw new StoreError(`この生き物には${used}件の観察記録があるため削除できません`);
  }
  commit({ ...d, creatures: d.creatures.filter((c) => c.id !== id) });
}

// ---------------------------------------------------------------------------
// 観察記録
// ---------------------------------------------------------------------------

export interface RecordInput {
  creatureId: string;
  eventId: string | null;
  locationType: LocationType;
  mainLocationId: string | null;
  otherLocationName: string;
  /** 詳細座標（任意）。主な場所で未指定なら主な場所の座標を使う */
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
  memo: string;
}

/** 座標は地図の範囲（4県）の中に限る（D28）。座標なしは許す */
function requireInSurveyArea(lat: number | null, lng: number | null) {
  if (lat === null && lng === null) return;
  if (lat === null || lng === null || !isInSurveyArea(lat, lng)) {
    throw new StoreError('位置が地図の範囲外（愛知・岐阜・三重・滋賀の4県）です。マップで位置を選び直してください');
  }
}

function buildRecordFields(input: RecordInput) {
  const d = getDb();
  if (!d.creatures.some((c) => c.id === input.creatureId)) {
    throw new StoreError('生き物を選択してください');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new StoreError('日付を入力してください');
  if (!/^\d{2}:\d{2}$/.test(input.time)) throw new StoreError('時刻を入力してください');
  if (input.eventId && !d.events.some((e) => e.id === input.eventId)) {
    throw new StoreError('観察会が見つかりません');
  }

  let mainLocationId: string | null = null;
  let locationName = '';
  let lat: number | null = null;
  let lng: number | null = null;

  if (input.locationType === 'main') {
    const loc = findMainLocation(input.mainLocationId);
    if (!loc) throw new StoreError('主な場所を選択してください');
    mainLocationId = loc.id;
    locationName = loc.name;
    lat = input.lat ?? loc.lat;
    lng = input.lng ?? loc.lng;
  } else if (input.locationType === 'other') {
    locationName = input.otherLocationName.trim() || 'その他の場所';
    lat = input.lat;
    lng = input.lng;
  }
  requireInSurveyArea(lat, lng);

  return {
    creatureId: input.creatureId,
    eventId: input.eventId,
    locationType: input.locationType,
    mainLocationId,
    locationName,
    lat,
    lng,
    date: input.date,
    time: input.time,
    memo: input.memo.trim(),
  };
}

export function addRecord(actorId: string, input: RecordInput): ObservationRecord {
  requireUser(actorId);
  const record: ObservationRecord = {
    id: crypto.randomUUID(),
    ...buildRecordFields(input),
    userId: actorId,
    createdAt: nowIso(),
  };
  const d = getDb();
  commit({ ...d, records: [...d.records, record] });
  return record;
}

function requireOwnRecord(actorId: string, id: string): ObservationRecord {
  requireUser(actorId);
  const record = getDb().records.find((r) => r.id === id);
  if (!record) throw new StoreError('記録が見つかりません');
  if (record.userId !== actorId) throw new StoreError('自分の記録のみ編集・削除できます');
  return record;
}

export function updateRecord(actorId: string, id: string, input: RecordInput) {
  const current = requireOwnRecord(actorId, id);
  const fields = buildRecordFields({ ...input, eventId: current.eventId });
  const d = getDb();
  commit({ ...d, records: d.records.map((r) => (r.id === id ? { ...r, ...fields } : r)) });
}

export function deleteRecord(actorId: string, id: string) {
  requireOwnRecord(actorId, id);
  const d = getDb();
  commit({ ...d, records: d.records.filter((r) => r.id !== id) });
}

// ---------------------------------------------------------------------------
// 観察会
// ---------------------------------------------------------------------------

export interface EventInput {
  name: string;
  mainLocationId: string | null;
  otherLocationName: string;
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
}

export function createEvent(actorId: string, input: EventInput): ObservationEvent {
  requireUser(actorId);
  const name = input.name.trim();
  if (!name) throw new StoreError('観察会名を入力してください');
  const loc = findMainLocation(input.mainLocationId);
  const other = input.otherLocationName.trim();
  if (!loc && !other) throw new StoreError('場所を選択してください');
  if (!input.date || !input.time) throw new StoreError('日付と時間を入力してください');
  const lat = input.lat ?? loc?.lat ?? null;
  const lng = input.lng ?? loc?.lng ?? null;
  requireInSurveyArea(lat, lng);

  const event: ObservationEvent = {
    id: crypto.randomUUID(),
    name,
    mainLocationId: loc?.id ?? null,
    locationName: loc?.name ?? other,
    lat,
    lng,
    date: input.date,
    time: input.time,
    createdBy: actorId,
    createdAt: nowIso(),
  };
  const d = getDb();
  commit({ ...d, events: [...d.events, event] });
  return event;
}
