import type { LocationStatsResponse, MainLocationView } from '@yamon/shared';
import { asc, count, desc, eq, isNotNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { requirePermission, type AuthedEnv } from '../auth/middleware';
import { schema } from '../db/client';

const { mainLocations, observationRecords: r, creatures } = schema;

export const mainLocationRoutes = new Hono<AuthedEnv>()
  /** 主な場所（「使わない」場所も含む。選択肢に出すかは画面が isActive で決める） */
  .get('/', requirePermission('records.view'), async (c) => {
    const locations: MainLocationView[] = await c
      .get('db')
      .select({
        id: mainLocations.id,
        name: mainLocations.name,
        lat: mainLocations.lat,
        lng: mainLocations.lng,
        isActive: mainLocations.isActive,
      })
      .from(mainLocations)
      .orderBy(asc(mainLocations.sortOrder), asc(mainLocations.createdAt));
    return c.json({ locations });
  });

export const statsRoutes = new Hono<AuthedEnv>()
  /** 場所別一覧：主な場所ごとの、記録された生き物と観察回数（多い順） */
  .get('/locations', requirePermission('records.view'), async (c) => {
    const rows = await c
      .get('db')
      .select({
        mainLocationId: r.mainLocationId,
        id: creatures.id,
        name: creatures.name,
        category: creatures.category,
        memo: creatures.memo,
        count: count(r.id),
      })
      .from(r)
      .innerJoin(creatures, eq(creatures.id, r.creatureId))
      .where(isNotNull(r.mainLocationId))
      .groupBy(r.mainLocationId, creatures.id)
      .orderBy(desc(count(r.id)), asc(creatures.name));

    const byLocation = new Map<string, LocationStatsResponse['locations'][number]['creatures']>();
    for (const { mainLocationId, ...creature } of rows) {
      byLocation.set(mainLocationId!, [...(byLocation.get(mainLocationId!) ?? []), creature]);
    }
    const body: LocationStatsResponse = {
      locations: [...byLocation].map(([mainLocationId, list]) => ({ mainLocationId, creatures: list })),
    };
    return c.json(body);
  });
