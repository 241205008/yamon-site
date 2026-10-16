import { recorderLabel, type RecordView } from '@yamon/shared';
import { eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '../db/client';
import { schema } from '../db/client';

const { observationRecords: r, creatures, users, mainLocations } = schema;

/**
 * 記録を画面に返すときの列。生き物の名前・記録者・主な場所の今の名前を結合して返す
 * （主な場所の名前を直すと、過去の記録の表示にも反映される、D27）
 */
export const recordColumns = {
  id: r.id,
  creatureId: r.creatureId,
  creatureName: creatures.name,
  category: creatures.category,
  eventId: r.eventId,
  locationType: r.locationType,
  mainLocationId: r.mainLocationId,
  locationName: sql<string>`coalesce(${mainLocations.name}, ${r.locationName})`,
  lat: r.lat,
  lng: r.lng,
  date: r.date,
  time: r.time,
  memo: r.memo,
  userId: r.userId,
  userName: users.name,
  userRole: users.role,
  userStatus: users.status,
  createdAt: r.createdAt,
  /** ページングのカーソル用。Date にするとマイクロ秒が落ちて、同じ順位の記録を飛ばしてしまうため文字列で読む */
  createdAtKey: sql<string>`${r.createdAt}::text`,
};

/** recordColumns で select するときの FROM と JOIN */
export function selectRecords(db: Db) {
  return db
    .select(recordColumns)
    .from(r)
    .innerJoin(creatures, eq(creatures.id, r.creatureId))
    .innerJoin(users, eq(users.id, r.userId))
    .leftJoin(mainLocations, eq(mainLocations.id, r.mainLocationId))
    .$dynamic();
}

export type RecordRow = Awaited<ReturnType<ReturnType<typeof selectRecords>['execute']>>[number];

export function toRecordView(row: RecordRow): RecordView {
  return {
    id: row.id,
    creatureId: row.creatureId,
    creatureName: row.creatureName,
    category: row.category,
    eventId: row.eventId,
    locationType: row.locationType,
    mainLocationId: row.mainLocationId,
    locationName: row.locationName,
    lat: row.lat,
    lng: row.lng,
    date: row.date,
    time: row.time,
    memo: row.memo,
    userId: row.userId,
    recorderName: recorderLabel({ name: row.userName, role: row.userRole, status: row.userStatus }),
    createdAt: row.createdAt.toISOString(),
  };
}

/** 主な場所を ID で読む。activeOnly なら「使わない」場所はないものとして扱う */
export async function findMainLocation(db: Db, id: string, { activeOnly }: { activeOnly: boolean }) {
  const [loc] = await db.select().from(mainLocations).where(eq(mainLocations.id, id)).limit(1);
  if (!loc || (activeOnly && !loc.isActive)) {
    throw new HTTPException(400, { message: '主な場所が見つかりません。選び直してください' });
  }
  return loc;
}

export const notFound = (what: string) => new HTTPException(404, { message: `${what}が見つかりません` });
