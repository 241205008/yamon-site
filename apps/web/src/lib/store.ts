import { useSyncExternalStore } from 'react';
import { findMainLocation, isInSurveyArea, type SessionUser } from '@yamon/shared';
import { hashPassword, MIN_PASSWORD_LENGTH, newSalt } from './password';
import { createSeedDatabase } from './seed';
import type {
  AdminTransfer,
  Category,
  Creature,
  Database,
  Invitation,
  InvitationStatus,
  LocationType,
  ObservationEvent,
  ObservationRecord,
  User,
} from './types';

export const DB_KEY = 'yamon:db:v1';

export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
export const TRANSFER_REVERT_MS = 60 * 60 * 1000;

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

const normEmail = (email: string) => email.trim().toLowerCase();

// ---------------------------------------------------------------------------
// 操作者の検証
// ---------------------------------------------------------------------------

function requireUser(actorId: string): User {
  const user = getDb().users.find((u) => u.id === actorId);
  if (!user || !user.isActive) throw new StoreError('ログインし直してください');
  return user;
}

function requireAdmin(actorId: string): User {
  const user = requireUser(actorId);
  if (user.role !== 'admin') throw new StoreError('管理者のみ実行できます');
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

// ---------------------------------------------------------------------------
// 招待
// ---------------------------------------------------------------------------

export function invitationStatus(inv: Invitation, now = Date.now()): InvitationStatus {
  if (inv.status === 'accepted') return 'accepted';
  return new Date(inv.expiresAt).getTime() <= now ? 'expired' : 'pending';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createInvitation(actorId: string, name: string, email: string): Invitation {
  requireAdmin(actorId);
  const addr = normEmail(email);
  if (!EMAIL_RE.test(addr)) throw new StoreError('メールアドレスの形式が正しくありません');
  const d = getDb();
  if (d.users.some((u) => u.email === addr)) {
    throw new StoreError('このメールアドレスはすでに登録されています');
  }
  const now = new Date();
  const inv: Invitation = {
    id: crypto.randomUUID(),
    email: addr,
    name: name.trim(),
    invitedBy: actorId,
    invitedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS).toISOString(),
    status: 'pending',
    token: crypto.randomUUID(),
  };
  // 同じアドレスへの未使用の招待は新しいもので置き換える（古いトークンを無効にする）
  const rest = d.invitations.filter((i) => !(i.email === addr && i.status === 'pending'));
  commit({ ...d, invitations: [inv, ...rest] });
  return inv;
}

/** 再送信：トークンを作り直し、有効期限を48時間延ばす */
export function resendInvitation(actorId: string, id: string): Invitation {
  requireAdmin(actorId);
  const d = getDb();
  const inv = d.invitations.find((i) => i.id === id);
  if (!inv || inv.status === 'accepted') throw new StoreError('この招待は再送信できません');
  const now = new Date();
  const next: Invitation = {
    ...inv,
    invitedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS).toISOString(),
    token: crypto.randomUUID(),
  };
  commit({ ...d, invitations: d.invitations.map((i) => (i.id === id ? next : i)) });
  return next;
}

export function deleteInvitation(actorId: string, id: string) {
  requireAdmin(actorId);
  const d = getDb();
  commit({ ...d, invitations: d.invitations.filter((i) => i.id !== id) });
}

/** 登録画面用：トークンから有効な招待を探す。使えない場合は理由つきで例外 */
export function findUsableInvitation(token: string): Invitation {
  const inv = getDb().invitations.find((i) => i.token === token.trim());
  if (!inv) throw new StoreError('招待トークンが正しくありません');
  const status = invitationStatus(inv);
  if (status === 'accepted') throw new StoreError('この招待トークンはすでに使用されています');
  if (status === 'expired') {
    throw new StoreError('この招待トークンは有効期限（48時間）が切れています。管理者に再送信を依頼してください');
  }
  return inv;
}

export async function registerWithInvitation(token: string, name: string, password: string) {
  const inv = findUsableInvitation(token);
  const displayName = name.trim();
  if (!displayName) throw new StoreError('ユーザー名を入力してください');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new StoreError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`);
  }
  const salt = newSalt();
  const passwordHash = await hashPassword(password, salt);

  // ハッシュ計算中に別タブで使われた可能性があるので、最新の状態で再確認する
  findUsableInvitation(token);
  const d = getDb();
  if (d.users.some((u) => u.email === inv.email)) {
    throw new StoreError('このメールアドレスはすでに登録されています');
  }
  const user: User = {
    id: crypto.randomUUID(),
    email: inv.email,
    name: displayName,
    role: 'user',
    isActive: true,
    passwordHash,
    passwordSalt: salt,
    createdAt: nowIso(),
  };
  commit({
    ...d,
    users: [...d.users, user],
    invitations: d.invitations.map((i) => (i.id === inv.id ? { ...i, status: 'accepted' } : i)),
  });
  return user;
}

// ---------------------------------------------------------------------------
// ユーザー管理・管理者移譲
// ---------------------------------------------------------------------------

export function setUserActive(actorId: string, userId: string, isActive: boolean) {
  requireAdmin(actorId);
  const d = getDb();
  const target = d.users.find((u) => u.id === userId);
  if (!target) throw new StoreError('ユーザーが見つかりません');
  if (target.role === 'admin') throw new StoreError('管理者は無効化できません');
  commit({ ...d, users: d.users.map((u) => (u.id === userId ? { ...u, isActive } : u)) });
}

export function transferAdmin(actorId: string, toUserId: string): AdminTransfer {
  requireAdmin(actorId);
  const d = getDb();
  const target = d.users.find((u) => u.id === toUserId);
  if (!target || target.id === actorId) throw new StoreError('移譲先のユーザーが正しくありません');
  if (!target.isActive) throw new StoreError('無効化されているユーザーには移譲できません');
  const now = new Date();
  const transfer: AdminTransfer = {
    id: crypto.randomUUID(),
    fromUserId: actorId,
    toUserId,
    transferredAt: now.toISOString(),
    revertDeadline: new Date(now.getTime() + TRANSFER_REVERT_MS).toISOString(),
    revertedAt: null,
  };
  commit({
    ...d,
    users: d.users.map((u) =>
      u.id === actorId ? { ...u, role: 'user' } : u.id === toUserId ? { ...u, role: 'admin' } : u,
    ),
    transfers: [transfer, ...d.transfers],
  });
  return transfer;
}

export function canRevertTransfer(t: AdminTransfer, now = Date.now()): boolean {
  if (t.revertedAt) return false;
  if (new Date(t.revertDeadline).getTime() <= now) return false;
  // 移譲先がさらに別の人へ移譲していたら、取り消すと管理者が2人になるので不可
  const to = getDb().users.find((u) => u.id === t.toUserId);
  return to?.role === 'admin';
}

/** 取り消しは移譲元のユーザー本人だけが、期限内に実行できる */
export function revertTransfer(actorId: string, transferId: string) {
  requireUser(actorId);
  const d = getDb();
  const t = d.transfers.find((x) => x.id === transferId);
  if (!t) throw new StoreError('移譲記録が見つかりません');
  if (t.fromUserId !== actorId) throw new StoreError('移譲元のユーザーのみ取り消せます');
  if (!canRevertTransfer(t)) throw new StoreError('取り消し期限を過ぎているため取り消せません');
  commit({
    ...d,
    users: d.users.map((u) =>
      u.id === t.fromUserId ? { ...u, role: 'admin' } : u.id === t.toUserId ? { ...u, role: 'user' } : u,
    ),
    transfers: d.transfers.map((x) => (x.id === transferId ? { ...x, revertedAt: nowIso() } : x)),
  });
}
