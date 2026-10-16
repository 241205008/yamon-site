import { z } from 'zod';
import { emailSchema, newPasswordSchema } from './auth';
import { ROLES, type Role, type UserStatus } from './master';
import { requiredText } from './schemas';

/** 招待リンクの有効期限（MVP 2章「ログイン」） */
export const INVITATION_TTL_HOURS = 48;

/** 退会（匿名化）したユーザーの表示名（D26） */
export const WITHDRAWN_USER_NAME = '退会済みユーザー';

/** 名前の長さの上限 */
export const MAX_NAME_LENGTH = 50;

export const roleSchema = z.enum(ROLES);

/** 招待を作る（管理者）。招待時に役割を選べる */
export const invitationInputSchema = z.object({ email: emailSchema, role: roleSchema });
export type InvitationInput = z.input<typeof invitationInputSchema>;

/** 役割を変える（管理者） */
export const roleChangeInputSchema = z.object({ role: roleSchema });

/** 招待リンクのトークン（URL に入れて渡す。256 ビットの base64url で 43 文字） */
export const invitationTokenSchema = z.string().trim().min(1, '招待トークンを入力してください').max(200);

export const invitationLookupInputSchema = z.object({ token: invitationTokenSchema });

/** 招待リンクから登録する */
export const invitationAcceptInputSchema = z.object({
  token: invitationTokenSchema,
  name: requiredText(MAX_NAME_LENGTH),
  password: newPasswordSchema,
});
export type InvitationAcceptInput = z.input<typeof invitationAcceptInputSchema>;

/** 招待リンクを開いたときに見せる内容（POST /api/invitations/lookup） */
export interface InvitationInfo {
  email: string;
  role: Role;
  expiresAt: string;
}

export type InvitationStatus = 'pending' | 'used' | 'expired' | 'revoked';

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: '招待中',
  used: '登録済み',
  expired: '期限切れ',
  revoked: '取り消し済み',
};

/** 管理者画面のユーザー一覧（GET /api/admin/users） */
export interface AdminUser {
  id: string;
  name: string;
  /** 退会したユーザーは null */
  email: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

/** 管理者画面の招待の一覧（GET /api/admin/invitations） */
export interface AdminInvitation {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
}

export const AUDIT_ACTIONS = ['role_changed', 'disabled', 'enabled', 'withdrawn'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  role_changed: '役割の変更',
  disabled: '無効化',
  enabled: '有効化',
  withdrawn: '退会処理',
};

/** 操作履歴（GET /api/admin/audit-logs） */
export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorName: string;
  targetName: string;
  fromRole: Role | null;
  toRole: Role | null;
  createdAt: string;
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: '通常',
  disabled: '無効化',
  withdrawn: '退会',
};
