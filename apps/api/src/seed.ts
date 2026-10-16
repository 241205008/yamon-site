/**
 * 開発用のアカウントとデモデータを入れる：`npm run db:seed -w @yamon/api`（API サーバーを止めてから実行する。PGlite は同時に1つしか開けない）
 * 表ごとに、空のときだけ入れる（ユーザーが0人なら役割ごとに1人ずつ、主な場所が0件なら仮の5か所、記録が0件ならデモの記録）。
 * ローカルの PGlite 専用で、DATABASE_URL があるときは動かさない。本番の最初の管理者は、初回セットアップ（#4）で作る
 */
import { MAIN_LOCATIONS, type Category, type Role } from '@yamon/shared';
import { count } from 'drizzle-orm';
import { hashPassword } from './auth/password';
import { connectPglite, schema } from './db/client';

// 本番の DB に、パスワードが知られたアカウントを作らない。PGlite（ローカル）にだけ入れる
if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) {
  console.error('開発用のデータは、ローカルの PGlite にだけ作ります（NODE_ENV=production や DATABASE_URL があるときは作りません）');
  process.exit(1);
}

/** README の「開発用のアカウント」と同じ。パスワードはすべて password123 */
export const DEV_ACCOUNTS: { email: string; name: string; role: Role }[] = [
  { email: 'admin@example.com', name: '管理者', role: 'admin' },
  { email: 'officer@example.com', name: '幹部', role: 'officer' },
  { email: 'member@example.com', name: '部員', role: 'member' },
  { email: 'obog@example.com', name: 'OB・OG', role: 'viewer' },
];
const DEV_PASSWORD = 'password123';

const DEMO_CREATURES: { name: string; category: Category; memo?: string }[] = [
  { name: 'ヤモリ', category: 'アクア', memo: '夜行性。壁や窓に張り付いていることが多い。' },
  { name: 'ニホンアマガエル', category: 'アクア', memo: '雨の前後によく鳴く。' },
  { name: 'トノサマガエル', category: 'アクア' },
  { name: 'アキアカネ', category: 'インセクター', memo: '秋に平地へ降りてくる赤とんぼ。' },
  { name: 'オニヤンマ', category: 'インセクター' },
  { name: 'セミ', category: 'インセクター' },
  { name: 'ホタル', category: 'インセクター', memo: '6月ごろの夜に水辺で発光。' },
  { name: 'カブトムシ', category: 'インセクター' },
  { name: 'チョウ', category: 'インセクター' },
];

const handle = await connectPglite(process.env.PGLITE_DIR ?? '.data/pglite');
const { db } = handle;
const isEmpty = async (table: typeof schema.users | typeof schema.mainLocations | typeof schema.observationRecords) =>
  (await db.select({ n: count() }).from(table))[0].n === 0;

try {
  if (await isEmpty(schema.users)) {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    await db.insert(schema.users).values(DEV_ACCOUNTS.map((a) => ({ ...a, passwordHash })));
    console.log(`開発用のアカウントを作りました（パスワードはすべて ${DEV_PASSWORD}）`);
    for (const a of DEV_ACCOUNTS) console.log(`  ${a.role.padEnd(7)} ${a.email}`);
  } else {
    console.log('ユーザーが既にいるため、アカウントは作りません');
  }

  // 主な場所は、管理者が画面から登録するまでの仮の5か所（packages/shared の MAIN_LOCATIONS）
  if (await isEmpty(schema.mainLocations)) {
    await db
      .insert(schema.mainLocations)
      .values(MAIN_LOCATIONS.map((l, i) => ({ name: l.name, lat: l.lat, lng: l.lng, sortOrder: i })));
    console.log(`主な場所（仮の${MAIN_LOCATIONS.length}か所）を入れました`);
  }

  if (await isEmpty(schema.observationRecords)) {
    await seedDemoRecords();
    console.log('デモの生き物・観察会・記録を入れました');
  }
} finally {
  await handle.close();
}

/** 画面を試すためのデモの記録（以前の localStorage 版のデモデータと同じ内容） */
async function seedDemoRecords() {
  const users = await db.select().from(schema.users);
  const byEmail = (email: string) => users.find((u) => u.email === email)?.id ?? users[0].id;
  const admin = byEmail('admin@example.com');
  const member = byEmail('member@example.com');
  const officer = byEmail('officer@example.com');

  const places = await db.select().from(schema.mainLocations);
  const place = (name: string) => places.find((p) => p.name === name) ?? places[0];

  const existing = await db.select().from(schema.creatures);
  const missing = DEMO_CREATURES.filter((c) => !existing.some((e) => e.name === c.name));
  const inserted = missing.length
    ? await db.insert(schema.creatures).values(missing.map((c) => ({ ...c, createdBy: admin }))).returning()
    : [];
  const creatures = [...existing, ...inserted];
  const creature = (name: string) => creatures.find((c) => c.name === name)!.id;

  const event = async (name: string, placeName: string, date: string, time: string, createdBy: string) => {
    const p = place(placeName);
    const [ev] = await db
      .insert(schema.events)
      .values({ name, mainLocationId: p.id, locationName: p.name, lat: p.lat, lng: p.lng, date, time, createdBy })
      .returning();
    return ev.id;
  };
  const summer = await event('夏の森林公園観察会', '森林公園', '2026-07-15', '10:00', admin);
  const river = await event('初夏の河川敷生き物調査', '河川敷エリア', '2026-06-10', '14:00', member);

  const main = (
    creatureName: string,
    placeName: string,
    date: string,
    time: string,
    userId: string,
    memo = '',
    eventId: string | null = null,
  ) => {
    const p = place(placeName);
    return {
      creatureId: creature(creatureName),
      eventId,
      locationType: 'main' as const,
      mainLocationId: p.id,
      locationName: p.name,
      lat: p.lat,
      lng: p.lng,
      date,
      time,
      memo,
      userId,
    };
  };

  await db.insert(schema.observationRecords).values([
    main('ヤモリ', '中央公園', '2026-04-10', '20:30', admin, '公園のトイレの壁に数匹のヤモリを発見。虫を捕食している様子も観察できた。'),
    main('ニホンアマガエル', '河川敷エリア', '2026-04-08', '17:45', admin, '雨上がりで複数個体が活発に活動していた。'),
    main('アキアカネ', '河川敷エリア', '2026-04-05', '15:20', member),
    main('ホタル', '森林公園', '2026-04-03', '20:10', officer),
    main('ヤモリ', '森林公園', '2026-04-02', '21:00', member),
    main('オニヤンマ', '池のある広場', '2026-04-01', '11:00', officer),
    main('カブトムシ', '山の麓', '2026-03-30', '05:40', member),
    {
      creatureId: creature('トノサマガエル'),
      eventId: null,
      locationType: 'other' as const,
      mainLocationId: null,
      locationName: '田んぼのあぜ道',
      lat: 35.131,
      lng: 136.9702,
      date: '2026-03-28',
      time: '16:00',
      memo: '',
      userId: member,
    },
    main('セミ', '森林公園', '2026-07-15', '10:30', admin, '観察会開始直後に複数のセミの鳴き声を確認。', summer),
    main('カブトムシ', '森林公園', '2026-07-15', '11:15', member, 'クヌギの樹液に集まっていた。', summer),
    main('ニホンアマガエル', '河川敷エリア', '2026-06-10', '14:20', member, '', river),
    main('チョウ', '河川敷エリア', '2026-06-10', '14:45', officer, '', river),
  ]);
}
