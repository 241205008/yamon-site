import { findMainLocation } from '@yamon/shared';
import { hashPassword, newSalt } from './password';
import type {
  Creature,
  Database,
  Invitation,
  ObservationEvent,
  ObservationRecord,
  User,
} from './types';

/**
 * 初回起動時に入れるデモデータ。
 * ログイン用アカウントは README の「初期アカウント」を参照。
 */
export const SEED_ACCOUNTS = [
  { id: 'user-admin', email: 'admin@example.com', name: '管理者', role: 'admin', password: 'admin1234' },
  { id: 'user-1', email: 'user1@example.com', name: 'ユーザー1', role: 'user', password: 'user1234' },
  { id: 'user-2', email: 'user2@example.com', name: 'ユーザー2', role: 'user', password: 'user1234' },
] as const;

const CREATURES: Creature[] = [
  { id: 'cr-yamori', name: 'ヤモリ', category: 'アクア', memo: '夜行性。壁や窓に張り付いていることが多い。' },
  { id: 'cr-amagaeru', name: 'ニホンアマガエル', category: 'アクア', memo: '雨の前後によく鳴く。' },
  { id: 'cr-tonosama', name: 'トノサマガエル', category: 'アクア', memo: '' },
  { id: 'cr-akiakane', name: 'アキアカネ', category: 'インセクター', memo: '秋に平地へ降りてくる赤とんぼ。' },
  { id: 'cr-oniyanma', name: 'オニヤンマ', category: 'インセクター', memo: '' },
  { id: 'cr-semi', name: 'セミ', category: 'インセクター', memo: '' },
  { id: 'cr-hotaru', name: 'ホタル', category: 'インセクター', memo: '6月ごろの夜に水辺で発光。' },
  { id: 'cr-kabutomushi', name: 'カブトムシ', category: 'インセクター', memo: '' },
  { id: 'cr-chou', name: 'チョウ', category: 'インセクター', memo: '' },
];

const SEED_TIME = '2026-04-20T00:00:00.000Z';

function mainRecord(
  id: string,
  creatureId: string,
  locationId: string,
  date: string,
  time: string,
  userId: string,
  memo = '',
  eventId: string | null = null,
): ObservationRecord {
  const loc = findMainLocation(locationId)!;
  return {
    id,
    creatureId,
    eventId,
    locationType: 'main',
    mainLocationId: loc.id,
    locationName: loc.name,
    lat: loc.lat,
    lng: loc.lng,
    date,
    time,
    memo,
    userId,
    createdAt: SEED_TIME,
  };
}

const EVENTS: ObservationEvent[] = [
  {
    id: 'ev-summer-forest',
    name: '夏の森林公園観察会',
    mainLocationId: 'loc-forest-park',
    locationName: '森林公園',
    lat: 35.695,
    lng: 139.782,
    date: '2026-07-15',
    time: '10:00',
    createdBy: 'user-admin',
    createdAt: SEED_TIME,
  },
  {
    id: 'ev-early-summer-river',
    name: '初夏の河川敷生き物調査',
    mainLocationId: 'loc-riverside',
    locationName: '河川敷エリア',
    lat: 35.6892,
    lng: 139.775,
    date: '2026-06-10',
    time: '14:00',
    createdBy: 'user-1',
    createdAt: SEED_TIME,
  },
];

const RECORDS: ObservationRecord[] = [
  mainRecord('rec-1', 'cr-yamori', 'loc-central-park', '2026-04-10', '20:30', 'user-admin',
    '公園のトイレの壁に数匹のヤモリを発見。体長は5cm程度で、灰色の体色をしていた。虫を捕食している様子も観察できた。'),
  mainRecord('rec-2', 'cr-amagaeru', 'loc-riverside', '2026-04-08', '17:45', 'user-admin',
    '河川敷の草むらで鳴き声を確認。雨上がりで複数個体が活発に活動していた。'),
  mainRecord('rec-3', 'cr-akiakane', 'loc-riverside', '2026-04-05', '15:20', 'user-1'),
  mainRecord('rec-4', 'cr-hotaru', 'loc-forest-park', '2026-04-03', '20:10', 'user-2'),
  mainRecord('rec-5', 'cr-yamori', 'loc-forest-park', '2026-04-02', '21:00', 'user-1'),
  mainRecord('rec-6', 'cr-oniyanma', 'loc-pond-square', '2026-04-01', '11:00', 'user-2'),
  mainRecord('rec-7', 'cr-kabutomushi', 'loc-mountain-foot', '2026-03-30', '05:40', 'user-1'),
  {
    id: 'rec-8',
    creatureId: 'cr-tonosama',
    eventId: null,
    locationType: 'other',
    mainLocationId: null,
    locationName: '田んぼのあぜ道',
    lat: 35.6852,
    lng: 139.7702,
    date: '2026-03-28',
    time: '16:00',
    memo: '',
    userId: 'user-1',
    createdAt: SEED_TIME,
  },
  mainRecord('rec-ev1-1', 'cr-semi', 'loc-forest-park', '2026-07-15', '10:30', 'user-admin',
    '観察会開始直後に複数のセミの鳴き声を確認。抜け殻も多数発見。', 'ev-summer-forest'),
  mainRecord('rec-ev1-2', 'cr-kabutomushi', 'loc-forest-park', '2026-07-15', '11:15', 'user-1',
    'クヌギの樹液に集まっていた。参加者全員で観察。', 'ev-summer-forest'),
  mainRecord('rec-ev2-1', 'cr-amagaeru', 'loc-riverside', '2026-06-10', '14:20', 'user-1', '', 'ev-early-summer-river'),
  mainRecord('rec-ev2-2', 'cr-chou', 'loc-riverside', '2026-06-10', '14:45', 'user-2', '', 'ev-early-summer-river'),
];

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
    creatures: structuredClone(CREATURES),
    events: structuredClone(EVENTS),
    records: structuredClone(RECORDS),
    invitations: [pendingInvitation(new Date()), ...structuredClone(ACCEPTED_INVITATIONS)],
    transfers: [],
  };
}
