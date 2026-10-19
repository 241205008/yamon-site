import type {
  AdminInvitation,
  AdminUser,
  AuditLogEntry,
  InvitationInput,
  IssuedInvitation,
  IssuedLink,
  Role,
} from '@yamon/shared';
import { apiFetch } from './api';

/** 管理者画面の API（/api/admin、管理者だけが使える） */

export const fetchUsers = () => apiFetch<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users);

export const fetchInvitations = () =>
  apiFetch<{ invitations: AdminInvitation[] }>('/api/admin/invitations').then((r) => r.invitations);

export const fetchAuditLogs = () =>
  apiFetch<{ auditLogs: AuditLogEntry[] }>('/api/admin/audit-logs').then((r) => r.auditLogs);

/** 招待を作る。応答の招待リンクを画面に出し、管理者が LINE などで本人に渡す（D46） */
export const createInvitation = (input: InvitationInput) =>
  apiFetch<IssuedInvitation>('/api/admin/invitations', { method: 'POST', body: input });

/** 招待リンクを作り直す（前のリンクは使えなくなる） */
export const reissueInvitation = (id: string) =>
  apiFetch<IssuedInvitation>(`/api/admin/invitations/${id}/reissue`, { method: 'POST' });

/** パスワード再設定のリンクを発行する（前に発行したリンクは使えなくなる、D46） */
export const issuePasswordReset = (id: string) =>
  apiFetch<IssuedLink>(`/api/admin/users/${id}/password-reset`, { method: 'POST' });

export const revokeInvitation = (id: string) =>
  apiFetch<{ id: string }>(`/api/admin/invitations/${id}/revoke`, { method: 'POST' });

export const changeRole = (id: string, role: Role) =>
  apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}/role`, { method: 'PATCH', body: { role } });

export const disableUser = (id: string) =>
  apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}/disable`, { method: 'POST' });

export const enableUser = (id: string) =>
  apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}/enable`, { method: 'POST' });

export const withdrawUser = (id: string) =>
  apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}/withdraw`, { method: 'POST' });
