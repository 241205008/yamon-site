import type {
  InvitationAcceptInput,
  InvitationInfo,
  MeResponse,
  PasswordResetAvailability,
  PasswordResetConfirmInput,
  SessionUser,
  SetupInput,
  SetupStatus,
} from '@yamon/shared';
import { useSyncExternalStore } from 'react';
import { apiFetch, setUnauthorizedHandler } from './api';
import { queryClient } from './queries';

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
  // ログアウトしたり別の人に替わったりしたら、前の人の権限で読んだデータを残さない
  if (currentUser?.id !== user?.id || currentUser?.role !== user?.role) queryClient.clear();
  currentUser = user;
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

/** 初回セットアップが必要か（ユーザーが1人もいないか）と、サーバーで登録できるか */
export function fetchSetupStatus(): Promise<SetupStatus> {
  return apiFetch<SetupStatus>('/api/setup');
}

/** 初回セットアップで最初の管理者を登録する。登録したらそのままログインした状態になる */
export async function setupFirstAdmin(input: SetupInput): Promise<SessionUser> {
  const { user } = await apiFetch<MeResponse>('/api/setup', { method: 'POST', body: input });
  setUser(user);
  return user!;
}

/** 本人がメールで再設定を申請できるか（メールの設定がなければ、管理者がリンクを発行する、D46） */
export async function fetchPasswordResetAvailability(): Promise<PasswordResetAvailability> {
  return apiFetch<PasswordResetAvailability>('/api/password-reset');
}

/** パスワード再設定のメールを送ってもらう。登録されていてもいなくても同じ案内（message）が返る */
export async function requestPasswordReset(email: string): Promise<string> {
  return (await apiFetch<{ message: string }>('/api/password-reset/request', { method: 'POST', body: { email } })).message;
}

/** 再設定リンクのトークンで新しいパスワードを決める。成功したら案内（message）が返る。ログインし直してもらう */
export async function confirmPasswordReset(input: PasswordResetConfirmInput): Promise<string> {
  return (await apiFetch<{ message: string }>('/api/password-reset/confirm', { method: 'POST', body: input })).message;
}
