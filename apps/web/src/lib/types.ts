import type { Category } from '@yamon/shared';

// 固定マスター（カテゴリ・時間帯・主な場所）はフロントとバックで共有するため @yamon/shared に置く
export { CATEGORIES, TIMES_OF_DAY } from '@yamon/shared';
export type { Category, MainLocation, TimeOfDay } from '@yamon/shared';

export interface Creature {
  id: string;
  name: string;
  category: Category;
  memo: string;
}

/** 'main' = 主な場所 / 'other' = その他の場所 / 'none' = 場所を指定しない */
export type LocationType = 'main' | 'other' | 'none';

/**
 * 観察記録。観察会にはネストせず eventId で紐付ける。
 * 生き物は名前ではなく creatureId で参照する（改名しても記録が壊れない）。
 * month / timeOfDay は保存せず date / time から導出する。
 */
export interface ObservationRecord {
  id: string;
  creatureId: string;
  eventId: string | null;
  locationType: LocationType;
  /** locationType === 'main' のとき */
  mainLocationId: string | null;
  /** 表示用の場所名（'none' のときは空文字） */
  locationName: string;
  /** 座標がない記録は null（0,0 では表さない） */
  lat: number | null;
  lng: number | null;
  date: string; // YYYY-MM-DD（JST）
  time: string; // HH:MM
  memo: string;
  userId: string;
  createdAt: string; // ISO
}

export interface ObservationEvent {
  id: string;
  name: string;
  mainLocationId: string | null;
  locationName: string;
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
  createdBy: string;
  createdAt: string;
}

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
  creatures: Creature[];
  events: ObservationEvent[];
  records: ObservationRecord[];
  invitations: Invitation[];
  transfers: AdminTransfer[];
}
