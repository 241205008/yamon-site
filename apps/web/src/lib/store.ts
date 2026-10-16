import { useSyncExternalStore } from 'react';
import type { SessionUser } from '@yamon/shared';
import { hashPassword, MIN_PASSWORD_LENGTH, newSalt } from './password';
import { createSeedDatabase } from './seed';
import type { AdminTransfer, Database, Invitation, InvitationStatus, User } from './types';

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
 * API でログインしたユーザーを、このストアのユーザー一覧にも入れる（招待・ユーザー管理を API に移すまでのつなぎ、#12）。
 * ストアの操作は actorId で本人を確かめるため
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
