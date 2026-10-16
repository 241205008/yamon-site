import type { AdminInvitation, AdminUser, AuditLogEntry, InvitationInput, Role } from '@yamon/shared';
import { apiFetch } from './api';

/** 管理者画面の API（/api/admin、管理者だけが使える） */

export const fetchUsers = () => apiFetch<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users);

export const fetchInvitations = () =>
  apiFetch<{ invitations: AdminInvitation[] }>('/api/admin/invitations').then((r) => r.invitations);

export const fetchAuditLogs = () =>
  apiFetch<{ auditLogs: AuditLogEntry[] }>('/api/admin/audit-logs').then((r) => r.auditLogs);

export const createInvitation = (input: InvitationInput) =>
  apiFetch<{ id: string }>('/api/admin/invitations', { method: 'POST', body: input });

export const resendInvitation = (id: string) =>
  apiFetch<{ id: string }>(`/api/admin/invitations/${id}/resend`, { method: 'POST' });

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
