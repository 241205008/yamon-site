import type { EventListResponse, EventView, RecordPage, RecordView, Role } from '@yamon/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../src/db/client';
import { createUser, jsonHeaders, login, setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
type Who = Role | 'otherMember';
const cookies = {} as Record<Who, string>;
let park: { id: string; name: string };
let pond: { id: string; name: string };

beforeAll(async () => {
  ctx = await setupTestApp();
  for (const who of ['admin', 'officer', 'member', 'viewer', 'otherMember'] as const) {
    const user = await createUser(ctx.db, { role: who === 'otherMember' ? 'member' : who });
    cookies[who] = await login(ctx, user.email, user.password);
  }
  [park, pond] = await ctx.db
    .insert(schema.mainLocations)
    .values([
      { name: '中央公園', lat: 35.127, lng: 136.9671 },
      { name: '池のある広場', lat: 35.1188, lng: 136.96 },
    ])
    .returning();
});
afterAll(() => ctx.close());

async function call<T = unknown>(method: string, path: string, who?: Who, body?: unknown) {
  const headers: Record<string, string> = who ? { cookie: cookies[who] } : {};
  const res = await ctx.app.request(`/api${path}`, {
    method,
    headers: method === 'GET' ? headers : { ...headers, ...jsonHeaders },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

const eventInput = (extra: Record<string, unknown> = {}) => ({
  name: '夏の観察会',
  mainLocationId: park.id,
  lat: null,
  lng: null,
  date: '2026-07-15',
  time: '10:00',
  ...extra,
});

async function newEvent(who: Who) {
  const res = await call<EventView>('POST', '/events', who, eventInput());
  expect(res.status).toBe(201);
  return res.body;
}

let seq = 0;
async function recordIn(eventId: string) {
  seq += 1;
  const creature = await call<{ id: string }>('POST', '/creatures', 'member', { name: `生き物${seq}`, category: 'アクア' });
  const res = await call<RecordView>('POST', '/records', 'member', {
    creatureId: creature.body.id,
    eventId,
    locationType: 'main',
    mainLocationId: park.id,
    lat: null,
    lng: null,
    date: '2026-07-15',
    time: '10:30',
  });
  expect(res.status).toBe(201);
  return res.body;
}

describe('観察会の編集', () => {
  it('作った本人は名前・場所・日時を直せる。紐づく記録の日付と場所は変わらない', async () => {
    const ev = await newEvent('member');
    const rec = await recordIn(ev.id);
    const res = await call<EventView>(
      'PUT',
      `/events/${ev.id}`,
      'member',
      eventInput({ name: '初夏の観察会', mainLocationId: pond.id, date: '2026-06-01', time: '09:00' }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: '初夏の観察会',
      mainLocationId: pond.id,
      locationName: '池のある広場',
      date: '2026-06-01',
      time: '09:00',
      recordCount: 1,
    });
    const page = await call<RecordPage>(`GET`, `/records?eventId=${ev.id}`, 'member');
    expect(page.body.records[0]).toMatchObject({ id: rec.id, date: '2026-07-15', locationName: '中央公園' });
  });

  it('管理者は他人の観察会も直せる。他の部員・幹部・OB・OG は 403', async () => {
    const ev = await newEvent('member');
    for (const who of ['otherMember', 'officer', 'viewer'] as const) {
      expect((await call('PUT', `/events/${ev.id}`, who, eventInput({ name: '書き換え' }))).status).toBe(403);
    }
    expect((await call('PUT', `/events/${ev.id}`, 'admin', eventInput({ name: '管理者が修正' }))).status).toBe(200);
  });

  it('その他の場所と現在位置にも変えられ、4県の外は 400', async () => {
    const ev = await newEvent('officer');
    const res = await call<EventView>(
      'PUT',
      `/events/${ev.id}`,
      'officer',
      eventInput({ mainLocationId: null, otherLocationName: '市民の森', lat: 35.15, lng: 136.99 }),
    );
    expect(res.body).toMatchObject({ mainLocationId: null, locationName: '市民の森', lat: 35.15, lng: 136.99 });
    const tokyo = await call('PUT', `/events/${ev.id}`, 'officer', eventInput({ lat: 35.68, lng: 139.76 }));
    expect(tokyo.status).toBe(400);
  });

  it('存在しない観察会は 404', async () => {
    const res = await call('PUT', '/events/00000000-0000-4000-8000-000000000000', 'admin', eventInput());
    expect(res.status).toBe(404);
  });
});

describe('観察会の削除', () => {
  it('削除すると一覧・統計から消え、紐づいていた記録は「観察会なし」で残る', async () => {
    const ev = await newEvent('member');
    const rec = await recordIn(ev.id);
    const before = (await call<EventListResponse>('GET', '/events', 'member')).body.stats;

    expect((await call('DELETE', `/events/${ev.id}`, 'member')).status).toBe(204);

    const after = await call<EventListResponse>('GET', '/events', 'member');
    expect(after.body.events.some((e) => e.id === ev.id)).toBe(false);
    expect(after.body.stats.eventCount).toBe(before.eventCount - 1);
    expect(after.body.stats.recordCount).toBe(before.recordCount - 1);
    expect((await call('GET', `/events/${ev.id}`, 'member')).status).toBe(404);

    const page = await call<RecordPage>('GET', '/records?limit=100', 'member');
    expect(page.body.records.find((r) => r.id === rec.id)).toMatchObject({ eventId: null, date: '2026-07-15' });
    const map = await call<{ records: RecordView[] }>('GET', '/records/map', 'member');
    expect(map.body.records.some((r) => r.id === rec.id)).toBe(true);
  });

  it('作った本人と管理者だけが削除できる', async () => {
    const ev = await newEvent('member');
    for (const who of ['otherMember', 'officer', 'viewer'] as const) {
      expect((await call('DELETE', `/events/${ev.id}`, who)).status).toBe(403);
    }
    expect((await call('DELETE', `/events/${ev.id}`, 'admin')).status).toBe(204);
  });
});
