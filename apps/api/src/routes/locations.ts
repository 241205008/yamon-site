import { mainLocationInputSchema, type LocationStatsResponse, type MainLocationView } from '@yamon/shared';
import { and, asc, count, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requirePermission, type AuthedEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { isForeignKeyViolation, notFound } from '../observations/view';
import { validate } from '../validator';

const { mainLocations, observationRecords: r, creatures, events } = schema;

/** 主な場所の一覧（記録の件数つき）。id を渡すとその1件だけ */
async function listMainLocations(db: Db, id?: string): Promise<MainLocationView[]> {
  return db
    .select({
      id: mainLocations.id,
      name: mainLocations.name,
      lat: mainLocations.lat,
      lng: mainLocations.lng,
      isActive: mainLocations.isActive,
      recordCount: count(r.id),
    })
    .from(mainLocations)
    .leftJoin(r, eq(r.mainLocationId, mainLocations.id))
    .where(id ? eq(mainLocations.id, id) : undefined)
    .groupBy(mainLocations.id)
    .orderBy(asc(mainLocations.sortOrder), asc(mainLocations.createdAt));
}

async function readMainLocation(db: Db, id: string) {
  const [loc] = await listMainLocations(db, id);
  if (!loc) throw notFound('主な場所');
  return loc;
}

/** 同じ名前の場所を2つ作らない（選択肢で見分けられなくなる） */
async function assertNameAvailable(db: Db, name: string, exceptId?: string) {
  const [dup] = await db
    .select({ id: mainLocations.id })
    .from(mainLocations)
    .where(and(eq(mainLocations.name, name), exceptId ? ne(mainLocations.id, exceptId) : undefined))
    .limit(1);
  if (dup) throw new HTTPException(409, { message: `「${name}」はすでに登録されています` });
}

const IN_USE_MESSAGE = 'この場所には記録または観察会があるため削除できません。「使わない」にしてください';

export const mainLocationRoutes = new Hono<AuthedEnv>()
  /** 主な場所（「使わない」場所も含む。選択肢に出すかは画面が isActive で決める） */
  .get('/', requirePermission('records.view'), async (c) => {
    return c.json({ locations: await listMainLocations(c.get('db')) });
  })
  /** 追加・編集は管理者だけ（D27）。座標は入力チェックで4県の範囲内に限る */
  .post('/', requirePermission('mainLocations.manage'), validate('json', mainLocationInputSchema), async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    await assertNameAvailable(db, input.name);
    // 新しい場所は一覧の最後に置く
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${mainLocations.sortOrder}), -1) + 1` })
      .from(mainLocations);
    const [created] = await db
      .insert(mainLocations)
      .values({ ...input, sortOrder: Number(next) })
      .returning({ id: mainLocations.id });
    return c.json(await readMainLocation(db, created.id), 201);
  })
  /** 名前を直すと、過去の記録・観察会の表示にも反映される（記録は ID で参照している） */
  .put('/:id{[0-9a-f-]{36}}', requirePermission('mainLocations.manage'), validate('json', mainLocationInputSchema), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const input = c.req.valid('json');
    await assertNameAvailable(db, input.name, id);
    const updated = await db.update(mainLocations).set(input).where(eq(mainLocations.id, id)).returning({ id: mainLocations.id });
    if (updated.length === 0) throw notFound('主な場所');
    return c.json(await readMainLocation(db, id));
  })
  /** 記録・観察会がない場所だけ削除できる。使わなくなった場所は「使わない」にする（D27） */
  .delete('/:id{[0-9a-f-]{36}}', requirePermission('mainLocations.manage'), async (c) => {
    const db = c.get('db');
    const loc = await readMainLocation(db, c.req.param('id'));
    const [{ eventCount }] = await db.select({ eventCount: count() }).from(events).where(eq(events.mainLocationId, loc.id));
    if (loc.recordCount > 0 || eventCount > 0) throw new HTTPException(409, { message: IN_USE_MESSAGE });
    try {
      await db.delete(mainLocations).where(eq(mainLocations.id, loc.id));
    } catch (err) {
      // 確かめた後に、別の人が記録や観察会を足していた（外部キーで止まる）
      if (isForeignKeyViolation(err)) throw new HTTPException(409, { message: IN_USE_MESSAGE });
      throw err;
    }
    return c.body(null, 204);
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
