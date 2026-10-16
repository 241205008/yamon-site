import { eventInputSchema, type EventListResponse, type EventView, type SessionUser } from '@yamon/shared';
import type { z } from 'zod';
import { asc, count, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { assertCanActOn, requirePermission, type AuthedEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { findMainLocation, notFound } from '../observations/view';
import { validate } from '../validator';

const { events, observationRecords: r, creatures, mainLocations } = schema;

/**
 * 観察会と、それぞれで記録された生き物・記録の件数。
 * 観察会は月に数回程度で、10年でも数百件なので、ページングせずにすべて返す
 */
async function listEvents(db: Db, id?: string): Promise<EventView[]> {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      mainLocationId: events.mainLocationId,
      // 主な場所は今の名前を返す（名前を直すと過去の観察会にも反映される）
      locationName: sql<string>`coalesce(${mainLocations.name}, ${events.locationName})`,
      lat: events.lat,
      lng: events.lng,
      date: events.date,
      time: events.time,
      createdBy: events.createdBy,
      createdAt: events.createdAt,
    })
    .from(events)
    .leftJoin(mainLocations, eq(mainLocations.id, events.mainLocationId))
    .where(id ? eq(events.id, id) : undefined)
    .orderBy(desc(events.date), desc(events.time), desc(events.createdAt));

  // 観察会ごと・生き物ごとの記録の件数
  const tallies = await db
    .select({
      eventId: r.eventId,
      creatureId: creatures.id,
      name: creatures.name,
      category: creatures.category,
      records: count(r.id),
    })
    .from(r)
    .innerJoin(creatures, eq(creatures.id, r.creatureId))
    .where(id ? eq(r.eventId, id) : isNotNull(r.eventId))
    .groupBy(r.eventId, creatures.id)
    .orderBy(asc(creatures.name));

  const byEvent = new Map<string, typeof tallies>();
  for (const t of tallies) byEvent.set(t.eventId!, [...(byEvent.get(t.eventId!) ?? []), t]);

  return rows.map((e) => {
    const list = byEvent.get(e.id) ?? [];
    return {
      ...e,
      createdAt: e.createdAt.toISOString(),
      recordCount: list.reduce((sum, t) => sum + t.records, 0),
      creatures: list.map((t) => ({ id: t.creatureId, name: t.name, category: t.category })),
    };
  });
}

/** 観察会の入力を DB に入れる値にする。「使わない」主な場所は新しく選べない（編集で場所を変えないときはそのまま残せる） */
async function buildEventValues(
  db: Db,
  input: z.output<typeof eventInputSchema>,
  current?: { mainLocationId: string | null },
) {
  const loc = input.mainLocationId
    ? await findMainLocation(db, input.mainLocationId, { activeOnly: current?.mainLocationId !== input.mainLocationId })
    : null;
  return {
    name: input.name,
    mainLocationId: loc?.id ?? null,
    locationName: loc?.name ?? input.otherLocationName,
    lat: input.lat ?? loc?.lat ?? null,
    lng: input.lng ?? loc?.lng ?? null,
    date: input.date,
    time: input.time,
  };
}

/** 編集・削除の対象を読み、作った本人か管理者か確かめる（MVP 2章） */
async function findEditableEvent(db: Db, user: SessionUser, id: string) {
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) throw notFound('観察会');
  assertCanActOn(user, event.createdBy, 'events.editOwn', 'events.editAny');
  return event;
}

export const eventRoutes = new Hono<AuthedEnv>()
  /** 観察会一覧と、観察会一覧の画面の統計 */
  .get('/', requirePermission('records.view'), async (c) => {
    const list = await listEvents(c.get('db'));
    const species = new Set(list.flatMap((e) => e.creatures.map((cr) => cr.id)));
    const body: EventListResponse = {
      events: list,
      stats: {
        eventCount: list.length,
        recordCount: list.reduce((sum, e) => sum + e.recordCount, 0),
        speciesCount: species.size,
      },
    };
    return c.json(body);
  })
  .get('/:id{[0-9a-f-]{36}}', requirePermission('records.view'), async (c) => {
    const [event] = await listEvents(c.get('db'), c.req.param('id'));
    if (!event) throw notFound('観察会');
    return c.json(event);
  })
  .post('/', requirePermission('events.create'), validate('json', eventInputSchema), async (c) => {
    const db = c.get('db');
    const values = await buildEventValues(db, c.req.valid('json'));
    const [created] = await db
      .insert(events)
      .values({ ...values, createdBy: c.get('user').id })
      .returning({ id: events.id });
    const [event] = await listEvents(db, created.id);
    return c.json(event, 201);
  })
  /**
   * 観察会の名前・場所・日時を直す（#7）。作った本人と管理者だけ。
   * 紐づく記録の日付や場所は変えない（記録はそれぞれの観察の事実なので）
   */
  .put('/:id{[0-9a-f-]{36}}', requirePermission('events.editOwn'), validate('json', eventInputSchema), async (c) => {
    const db = c.get('db');
    const current = await findEditableEvent(db, c.get('user'), c.req.param('id'));
    const values = await buildEventValues(db, c.req.valid('json'), current);
    await db.update(events).set(values).where(eq(events.id, current.id));
    const [event] = await listEvents(db, current.id);
    return c.json(event);
  })
  /**
   * 観察会を削除する（#7、D40）。紐づく記録は消さず、観察会との紐づけだけを外して「観察会なし」の記録として残す
   * （DB の外部キーの ON DELETE SET NULL で外れる）
   */
  .delete('/:id{[0-9a-f-]{36}}', requirePermission('events.editOwn'), async (c) => {
    const db = c.get('db');
    const current = await findEditableEvent(db, c.get('user'), c.req.param('id'));
    await db.delete(events).where(eq(events.id, current.id));
    return c.body(null, 204);
  });
