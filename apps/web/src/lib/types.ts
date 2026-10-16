/**
 * localStorage のストア（lib/store.ts）の型。招待・ユーザー管理を API に移すまで（#12）残す。
 * 生き物・観察会・観察記録は API に移した（#13、型は @yamon/shared の CreatureView など）
 */

export type Role = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface Invitation {
  id: string;
  email: string;
  name: string;
  invitedBy: string;
  invitedAt: string; // ISO
  expiresAt: string; // ISO（招待から48時間）
  /** 保存するのは pending / accepted のみ。expired は expiresAt から導出する */
  status: Exclude<InvitationStatus, 'expired'>;
  token: string;
}

export interface AdminTransfer {
  id: string;
  fromUserId: string;
  toUserId: string;
  transferredAt: string; // ISO
  revertDeadline: string; // ISO（移譲から1時間）
  revertedAt: string | null;
}

export interface Database {
  version: 1;
  users: User[];
  invitations: Invitation[];
  transfers: AdminTransfer[];
}
