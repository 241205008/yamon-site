import { eventInputSchema, type EventListResponse, type EventView } from '@yamon/shared';
import { asc, count, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requirePermission, type AuthedEnv } from '../auth/middleware';
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
    const input = c.req.valid('json');
    const loc = input.mainLocationId ? await findMainLocation(db, input.mainLocationId, { activeOnly: true }) : null;
    const [created] = await db
      .insert(events)
      .values({
        name: input.name,
        mainLocationId: loc?.id ?? null,
        locationName: loc?.name ?? input.otherLocationName,
        lat: input.lat ?? loc?.lat ?? null,
        lng: input.lng ?? loc?.lng ?? null,
        date: input.date,
        time: input.time,
        createdBy: c.get('user').id,
      })
      .returning({ id: events.id });
    const [event] = await listEvents(db, created.id);
    return c.json(event, 201);
  });
