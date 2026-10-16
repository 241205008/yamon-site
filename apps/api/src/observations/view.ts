import { blurCoordinate, can, recorderLabel, type RecordView, type SessionUser } from '@yamon/shared';
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
  locationProtected: creatures.locationProtected,
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

/**
 * 位置を丸めて返すか（D24）：保護対象の生き物の記録で、見る人が正確な位置を見る権限（管理者・幹部）を持たず、
 * 記録した本人（OB・OG になった人を含む）でもないとき
 */
export function shouldBlur(row: { locationProtected: boolean; userId: string }, viewer: SessionUser): boolean {
  return row.locationProtected && !can(viewer.role, 'locations.viewExact') && row.userId !== viewer.id;
}

/** 記録を、見る人に合わせた形にする。丸める記録の正確な座標は応答に含めない（D24） */
export function toRecordView(row: RecordRow, viewer: SessionUser): RecordView {
  const blur = shouldBlur(row, viewer) && row.lat !== null && row.lng !== null;
  return {
    id: row.id,
    creatureId: row.creatureId,
    creatureName: row.creatureName,
    category: row.category,
    eventId: row.eventId,
    locationType: row.locationType,
    mainLocationId: row.mainLocationId,
    locationName: row.locationName,
    lat: blur ? blurCoordinate(row.lat!) : row.lat,
    lng: blur ? blurCoordinate(row.lng!) : row.lng,
    approximate: blur,
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

/** PostgreSQL の外部キー違反（23503）か。ドライバーや drizzle が包んだ例外（cause）もたどる */
export function isForeignKeyViolation(err: unknown): boolean {
  for (let e = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23503') return true;
  }
  return false;
}

export const notFound = (what: string) => new HTTPException(404, { message: `${what}が見つかりません` });
