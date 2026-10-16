import type { InvitationAcceptInput, InvitationInfo, MeResponse, SessionUser } from '@yamon/shared';
import { useSyncExternalStore } from 'react';
import { apiFetch, setUnauthorizedHandler } from './api';
import { syncSessionUser } from './store';

/**
 * ログイン状態。正本は API のセッション（HttpOnly の Cookie、D18）で、ブラウザには保存しない。
 * 起動時と、タブに戻ってきたときに GET /api/auth/me で確かめ直す
 */
let currentUser: SessionUser | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setUser(user: SessionUser | null) {
  currentUser = user;
  // 記録などのデータは、まだ localStorage のストアにある（#13 で API に移す）。
  // ストアの操作はユーザー ID で本人を確かめるので、ログイン中のユーザーをストアにも入れておく
  if (user) syncSessionUser(user);
  listeners.forEach((l) => l());
}

export function getCurrentUser(): SessionUser | null {
  return currentUser;
}

export function useCurrentUser(): SessionUser | null {
  return useSyncExternalStore(subscribe, getCurrentUser);
}

/** ログイン中のユーザーを API に確かめ直す（自分の役割を変えたときなど） */
export async function refresh() {
  const { user } = await apiFetch<MeResponse>('/api/auth/me');
  setUser(user);
}

/** 画面を出す前に1回だけ呼ぶ。API に届かなければ未ログインとして扱う（ログイン画面で理由が出る） */
export async function initAuth(): Promise<void> {
  setUnauthorizedHandler(() => setUser(null));
  try {
    await refresh();
  } catch {
    setUser(null);
  }
  if (typeof window !== 'undefined') {
    // 別のタブでのログアウトや、8時間の期限切れ・無効化を、タブに戻ってきたときに反映する
    window.addEventListener('focus', () => {
      if (currentUser) refresh().catch(() => {});
    });
  }
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const { user } = await apiFetch<MeResponse>('/api/auth/login', { method: 'POST', body: { email, password } });
  setUser(user);
  return user!;
}

/** 失敗しても例外にしない。通信に失敗しても、この画面ではログアウトした状態にする */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // セッションは8時間で切れる。サーバーに残っても、この画面からは使わない
  }
  setUser(null);
}

/** 招待リンクのトークンから、招待されたアドレスと役割を調べる。使えないリンクは理由つきの ApiError */
export function lookupInvitation(token: string): Promise<InvitationInfo> {
  return apiFetch<InvitationInfo>('/api/invitations/lookup', { method: 'POST', body: { token } });
}

/** 招待リンクから登録する。登録したらそのままログインした状態になる */
export async function acceptInvitation(input: InvitationAcceptInput): Promise<SessionUser> {
  const { user } = await apiFetch<MeResponse>('/api/invitations/accept', { method: 'POST', body: input });
  setUser(user);
  return user!;
}
