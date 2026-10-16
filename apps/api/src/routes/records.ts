import {
  dateSchema,
  idSchema,
  mapQuerySchema,
  recordInputSchema,
  recordListQuerySchema,
  TIME_OF_DAY_RANGES,
  timeSchema,
  type RecordPage,
  type RecordView,
  type SessionUser,
} from '@yamon/shared';
import { and, count, desc, eq, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import { assertCanActOn, requirePermission, type AuthedEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { findMainLocation, notFound, selectRecords, toRecordView } from '../observations/view';
import { validate } from '../validator';

const { observationRecords: r, creatures, events } = schema;

/** 新しい順（日付→時刻→登録日時→ID）。ページングのカーソルもこの順で比べる */
const NEWEST_FIRST = [desc(r.date), desc(r.time), desc(r.createdAt), desc(r.id)];

interface Cursor {
  date: string;
  time: string;
  createdAt: string;
  id: string;
}

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify([c.date, c.time, c.createdAt, c.id])).toString('base64url');

/** PostgreSQL の timestamptz を文字列にした形（例 "2026-10-16 12:33:01.123456+09"） */
const TIMESTAMPTZ_TEXT = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/;

/** 中身も確かめる（壊れた値のまま SQL の型変換に渡すと、DB のエラー（500）になる） */
function decodeCursor(value: string): Cursor {
  try {
    const [date, time, createdAt, id] = JSON.parse(Buffer.from(value, 'base64url').toString()) as unknown[];
    if (
      dateSchema.safeParse(date).success &&
      timeSchema.safeParse(time).success &&
      typeof createdAt === 'string' &&
      TIMESTAMPTZ_TEXT.test(createdAt) &&
      idSchema.safeParse(id).success
    ) {
      return { date: date as string, time: time as string, createdAt, id: id as string };
    }
  } catch {
    // 下で 400 にする
  }
  throw new HTTPException(400, { message: '一覧の続きの指定が正しくありません。画面を読み込み直してください' });
}

/** 記録の入力を、DB に入れる値にする（生き物・観察会・主な場所が実在するかも確かめる） */
async function buildRecordValues(
  db: Db,
  input: z.output<typeof recordInputSchema>,
  current?: { mainLocationId: string | null },
) {
  // 生き物と観察会の確認は互いに関係ないので、まとめて問い合わせる
  const [[creature], event] = await Promise.all([
    db.select({ id: creatures.id }).from(creatures).where(eq(creatures.id, input.creatureId)).limit(1),
    input.eventId
      ? db.select({ id: events.id }).from(events).where(eq(events.id, input.eventId)).limit(1).then((rows) => rows[0])
      : null,
  ]);
  if (!creature) throw new HTTPException(400, { message: '生き物が見つかりません。選び直してください' });
  if (input.eventId && !event) throw new HTTPException(400, { message: '観察会が見つかりません' });

  let mainLocationId: string | null = null;
  let locationName = '';
  let lat: number | null = null;
  let lng: number | null = null;
  if (input.locationType === 'main') {
    // 「使わない」にした場所は新しく選べない。編集で場所を変えないときはそのまま残せる
    const unchanged = current?.mainLocationId === input.mainLocationId;
    const loc = await findMainLocation(db, input.mainLocationId!, { activeOnly: !unchanged });
    mainLocationId = loc.id;
    locationName = loc.name;
    lat = input.lat ?? loc.lat;
    lng = input.lng ?? loc.lng;
  } else if (input.locationType === 'other') {
    locationName = input.otherLocationName || 'その他の場所';
    lat = input.lat;
    lng = input.lng;
  }

  return {
    creatureId: input.creatureId,
    locationType: input.locationType,
    mainLocationId,
    locationName,
    lat,
    lng,
    date: input.date,
    time: input.time,
    memo: input.memo,
  };
}

async function readRecord(db: Db, id: string, viewer: SessionUser): Promise<RecordView> {
  const [row] = await selectRecords(db).where(eq(r.id, id)).limit(1);
  if (!row) throw notFound('記録');
  return toRecordView(row, viewer);
}

/** 編集・削除の対象を読み、作成者本人か確かめる（OB・OG は自分の過去の記録も不可、MVP 2章） */
async function findOwnRecord(db: Db, user: SessionUser, id: string) {
  const [record] = await db.select().from(r).where(eq(r.id, id)).limit(1);
  if (!record) throw notFound('記録');
  assertCanActOn(user, record.userId, 'records.editOwn');
  return record;
}

function timeOfDayCondition(timeOfDay: keyof typeof TIME_OF_DAY_RANGES): SQL {
  const { from, to } = TIME_OF_DAY_RANGES[timeOfDay];
  // 夜（20:00〜翌6:00）は日付をまたぐ。"HH:MM" の文字列はそのまま大小を比べられる
  return from < to
    ? sql`(${r.time} >= ${from} and ${r.time} < ${to})`
    : sql`(${r.time} >= ${from} or ${r.time} < ${to})`;
}

export const recordRoutes = new Hono<AuthedEnv>()
  /** 記録一覧（新しい順）。サーバー側でページングし、続きは nextCursor で取る */
  .get('/', requirePermission('records.view'), validate('query', recordListQuerySchema), async (c) => {
    const db = c.get('db');
    const { eventId, limit, cursor } = c.req.valid('query');
    const filter = eventId ? eq(r.eventId, eventId) : undefined;

    let after: SQL | undefined;
    if (cursor) {
      const k = decodeCursor(cursor);
      after = sql`(${r.date}, ${r.time}, ${r.createdAt}, ${r.id}) < (${k.date}::date, ${k.time}, ${k.createdAt}::timestamptz, ${k.id}::uuid)`;
    }

    // 1件多く読んで、続きがあるかを確かめる
    // 総数は最初のページでだけ数える（「さらに表示」のたびに数え直さない）
    const [rows, total] = await Promise.all([
      selectRecords(db)
        .where(and(filter, after))
        .orderBy(...NEWEST_FIRST)
        .limit(limit + 1),
      cursor ? null : db.select({ total: count() }).from(r).where(filter).then(([row]) => row.total),
    ]);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const body: RecordPage = {
      records: page.map((row) => toRecordView(row, c.get('user'))),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ date: last.date, time: last.time, createdAt: last.createdAtKey, id: last.id })
          : null,
      total,
    };
    return c.json(body);
  })
  /** マップに出す記録（座標があり、場所を指定した記録）。絞り込みはすべて AND */
  .get('/map', requirePermission('records.view'), validate('query', mapQuerySchema), async (c) => {
    const { creatureId, month, timeOfDay } = c.req.valid('query');
    const rows = await selectRecords(c.get('db'))
      .where(
        and(
          ne(r.locationType, 'none'),
          isNotNull(r.lat),
          creatureId ? eq(r.creatureId, creatureId) : undefined,
          month ? sql`extract(month from ${r.date}) = ${month}` : undefined,
          timeOfDay ? timeOfDayCondition(timeOfDay) : undefined,
        ),
      )
      .orderBy(...NEWEST_FIRST);
    const viewer = c.get('user');
    return c.json({ records: rows.map((row) => toRecordView(row, viewer)) });
  })
  .post('/', requirePermission('records.create'), validate('json', recordInputSchema), async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const values = await buildRecordValues(db, input);
    const [created] = await db
      .insert(r)
      .values({ ...values, eventId: input.eventId, userId: c.get('user').id })
      .returning({ id: r.id });
    return c.json(await readRecord(db, created.id, c.get('user')), 201);
  })
  /** 自分の記録だけ。記録の観察会は変えない（入力の eventId は無視する） */
  .put('/:id{[0-9a-f-]{36}}', requirePermission('records.editOwn'), validate('json', recordInputSchema), async (c) => {
    const db = c.get('db');
    const current = await findOwnRecord(db, c.get('user'), c.req.param('id'));
    const values = await buildRecordValues(db, c.req.valid('json'), current);
    await db.update(r).set(values).where(eq(r.id, current.id));
    return c.json(await readRecord(db, current.id, c.get('user')));
  })
  /** 自分の記録だけ。完全に消す（ゴミ箱は設けない、MVP 3章） */
  .delete('/:id{[0-9a-f-]{36}}', requirePermission('records.editOwn'), async (c) => {
    const db = c.get('db');
    const current = await findOwnRecord(db, c.get('user'), c.req.param('id'));
    await db.delete(r).where(eq(r.id, current.id));
    return c.body(null, 204);
  });
