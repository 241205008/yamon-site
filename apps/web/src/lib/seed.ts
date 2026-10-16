import { hashPassword, newSalt } from './password';
import type { Database, Invitation, User } from './types';

/**
 * 初回起動時に入れるデモデータ（招待・ユーザー管理の画面用。#12 で API に移すまで）。
 * 生き物・観察会・記録のデモデータは API の `npm run db:seed -w @yamon/api` で入れる
 */
export const SEED_ACCOUNTS = [
  { id: 'user-admin', email: 'admin@example.com', name: '管理者', role: 'admin', password: 'admin1234' },
  { id: 'user-1', email: 'user1@example.com', name: 'ユーザー1', role: 'user', password: 'user1234' },
  { id: 'user-2', email: 'user2@example.com', name: 'ユーザー2', role: 'user', password: 'user1234' },
] as const;

const SEED_TIME = '2026-04-20T00:00:00.000Z';

/** 未使用の招待はデモで「招待中」に見えるよう、初回起動時刻から48時間有効にする */
function pendingInvitation(now: Date): Invitation {
  return {
    id: 'inv-1',
    email: 'newuser@example.com',
    name: '新規ユーザー',
    invitedBy: 'user-admin',
    invitedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    token: crypto.randomUUID(),
  };
}

const ACCEPTED_INVITATIONS: Invitation[] = [
  {
    id: 'inv-2',
    email: 'user1@example.com',
    name: 'ユーザー1',
    invitedBy: 'user-admin',
    invitedAt: '2026-04-10T01:00:00.000Z',
    expiresAt: '2026-04-12T01:00:00.000Z',
    status: 'accepted',
    token: '0d3a9e51-7c2f-4b86-a1d4-93e6f5b2c870',
  },
];

export async function createSeedDatabase(): Promise<Database> {
  const users: User[] = await Promise.all(
    SEED_ACCOUNTS.map(async (a) => {
      const salt = newSalt();
      return {
        id: a.id,
        email: a.email,
        name: a.name,
        role: a.role,
        isActive: true,
        passwordSalt: salt,
        passwordHash: await hashPassword(a.password, salt),
        createdAt: SEED_TIME,
      };
    }),
  );
  return {
    version: 1,
    users,
    invitations: [pendingInvitation(new Date()), ...structuredClone(ACCEPTED_INVITATIONS)],
    transfers: [],
  };
}
