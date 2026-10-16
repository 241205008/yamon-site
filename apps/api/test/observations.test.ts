import type {
  ApiErrorBody,
  CreatureView,
  EventListResponse,
  EventView,
  LocationStatsResponse,
  RecordPage,
  RecordView,
  Role,
} from '@yamon/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../src/db/client';
import { createUser, jsonHeaders, login, setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
const cookies = {} as Record<Role, string>;
const ids = {} as Record<Role, string>;
let park: { id: string; lat: number; lng: number };
let closedPlace: { id: string };

beforeAll(async () => {
  ctx = await setupTestApp();
  for (const role of ['admin', 'officer', 'member', 'viewer'] as const) {
    const user = await createUser(ctx.db, { role, name: `${role}さん` });
    ids[role] = user.id;
    cookies[role] = await login(ctx, user.email, user.password);
  }
  [park] = await ctx.db
    .insert(schema.mainLocations)
    .values({ name: '中央公園', lat: 35.127, lng: 136.9671 })
    .returning();
  [closedPlace] = await ctx.db
    .insert(schema.mainLocations)
    .values({ name: '閉鎖した池', lat: 35.12, lng: 136.96, isActive: false })
    .returning();
});
afterAll(() => ctx.close());

async function call<T = unknown>(method: string, path: string, role?: Role, body?: unknown) {
  const headers: Record<string, string> = role ? { cookie: cookies[role] } : {};
  const res = await ctx.app.request(`/api${path}`, {
    method,
    headers: method === 'GET' ? headers : { ...headers, ...jsonHeaders },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

let creatureSeq = 0;
async function newCreature(role: Role = 'member', name?: string) {
  creatureSeq += 1;
  const res = await call<CreatureView>('POST', '/creatures', role, {
    name: name ?? `テスト生物${creatureSeq}`,
    category: 'インセクター',
  });
  expect(res.status).toBe(201);
  return res.body;
}

const recordInput = (creatureId: string, extra: Record<string, unknown> = {}) => ({
  creatureId,
  locationType: 'main',
  mainLocationId: park.id,
  lat: null,
  lng: null,
  date: '2026-07-15',
  time: '10:30',
  memo: '',
  ...extra,
});

async function newRecord(role: Role, creatureId: string, extra: Record<string, unknown> = {}) {
  const res = await call<RecordView>('POST', '/records', role, recordInput(creatureId, extra));
  expect(res.status).toBe(201);
  return res.body;
}

describe('生き物', () => {
  it('部員は登録・編集でき、一覧に記録の件数が付く', async () => {
    const c = await newCreature('member', 'カナヘビ');
    expect(c).toMatchObject({ name: 'カナヘビ', category: 'インセクター', recordCount: 0, locationProtected: false });

    const edited = await call<CreatureView>('PUT', `/creatures/${c.id}`, 'member', {
      name: ' ニホンカナヘビ ',
      category: 'アクア',
      memo: '日向ぼっこ',
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: 'ニホンカナヘビ', category: 'アクア', memo: '日向ぼっこ' });

    const list = await call<{ creatures: CreatureView[] }>('GET', '/creatures', 'viewer');
    expect(list.body.creatures.map((x) => x.name)).toContain('ニホンカナヘビ');
  });

  it('同じ名前は 409', async () => {
    await newCreature('member', 'オニヤンマ');
    const res = await call<ApiErrorBody>('POST', '/creatures', 'officer', { name: 'オニヤンマ', category: 'インセクター' });
    expect(res.status).toBe(409);
  });

  it('OB・OG と未ログインは登録できない', async () => {
    expect((await call('POST', '/creatures', 'viewer', { name: 'ヤモリ', category: 'アクア' })).status).toBe(403);
    expect((await call('POST', '/creatures', undefined, { name: 'ヤモリ', category: 'アクア' })).status).toBe(401);
    expect((await call('GET', '/creatures')).status).toBe(401);
  });

  it('記録がある生き物は削除できず、ない生き物は削除できる', async () => {
    const used = await newCreature();
    await newRecord('member', used.id);
    const blocked = await call<ApiErrorBody>('DELETE', `/creatures/${used.id}`, 'member');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain('1件');

    const unused = await newCreature();
    expect((await call('DELETE', `/creatures/${unused.id}`, 'member')).status).toBe(204);
  });
});

describe('観察記録', () => {
  it('部員が記録すると、主な場所の座標・名前と記録者名が入る', async () => {
    const c = await newCreature();
    const rec = await newRecord('member', c.id, { memo: ' 樹液に集まっていた ' });
    expect(rec).toMatchObject({
      creatureName: c.name,
      locationType: 'main',
      mainLocationId: park.id,
      locationName: '中央公園',
      lat: park.lat,
      lng: park.lng,
      memo: '樹液に集まっていた',
      userId: ids.member,
      recorderName: 'memberさん',
    });
  });

  it('OB・OG は記録を追加できない（403）', async () => {
    const c = await newCreature();
    const res = await call('POST', '/records', 'viewer', recordInput(c.id));
    expect(res.status).toBe(403);
  });

  it('4県の範囲外の座標・片方だけの座標は 400', async () => {
    const c = await newCreature();
    const tokyo = await call('POST', '/records', 'member', recordInput(c.id, { lat: 35.6812, lng: 139.7671 }));
    expect(tokyo.status).toBe(400);
    const half = await call('POST', '/records', 'member', recordInput(c.id, { lat: 35.13, lng: null }));
    expect(half.status).toBe(400);
  });

  it('「使わない」主な場所は新しく選べない', async () => {
    const c = await newCreature();
    const res = await call('POST', '/records', 'member', recordInput(c.id, { mainLocationId: closedPlace.id }));
    expect(res.status).toBe(400);
  });

  it('場所を指定しない記録は座標を持たない', async () => {
    const c = await newCreature();
    const rec = await newRecord('member', c.id, { locationType: 'none', mainLocationId: null, lat: 35.13, lng: 136.97 });
    expect(rec).toMatchObject({ locationType: 'none', locationName: '', lat: null, lng: null });
  });

  it('自分の記録は編集・削除でき、他人の記録は 403', async () => {
    const c = await newCreature();
    const rec = await newRecord('member', c.id);

    const others = await call('PUT', `/records/${rec.id}`, 'officer', recordInput(c.id, { memo: '書き換え' }));
    expect(others.status).toBe(403);
    expect((await call('DELETE', `/records/${rec.id}`, 'admin')).status).toBe(403);

    const mine = await call<RecordView>(
      'PUT',
      `/records/${rec.id}`,
      'member',
      recordInput(c.id, { locationType: 'other', mainLocationId: null, otherLocationName: '田んぼ', lat: 35.131, lng: 136.97 }),
    );
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ locationType: 'other', locationName: '田んぼ', lat: 35.131, mainLocationId: null });

    expect((await call('DELETE', `/records/${rec.id}`, 'member')).status).toBe(204);
    expect((await call('DELETE', `/records/${rec.id}`, 'member')).status).toBe(404);
  });

  it('OB・OG になった人は、自分の過去の記録も編集できない。記録者は「OB/OG」と表示する', async () => {
    const graduate = await createUser(ctx.db, { role: 'member', name: '卒業する人' });
    const cookie = await login(ctx, graduate.email, graduate.password);
    const c = await newCreature();
    const res = await ctx.app.request('/api/records', {
      method: 'POST',
      headers: { ...jsonHeaders, cookie },
      body: JSON.stringify(recordInput(c.id)),
    });
    const rec = (await res.json()) as RecordView;
    await ctx.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, graduate.id));

    const edit = await ctx.app.request(`/api/records/${rec.id}`, {
      method: 'PUT',
      headers: { ...jsonHeaders, cookie },
      body: JSON.stringify(recordInput(c.id)),
    });
    expect(edit.status).toBe(403);

    const page = await call<RecordPage>('GET', '/records?limit=100', 'member');
    expect(page.body.records.find((r) => r.id === rec.id)?.recorderName).toBe('OB/OG');
  });

  it('主な場所の名前を直すと、過去の記録の場所名にも反映される', async () => {
    const [place] = await ctx.db
      .insert(schema.mainLocations)
      .values({ name: '旧い名前', lat: 35.14, lng: 136.98 })
      .returning();
    const c = await newCreature();
    const rec = await newRecord('member', c.id, { mainLocationId: place.id });
    await ctx.db.update(schema.mainLocations).set({ name: '新しい名前' }).where(eq(schema.mainLocations.id, place.id));
    const page = await call<RecordPage>('GET', '/records?limit=100', 'member');
    expect(page.body.records.find((r) => r.id === rec.id)?.locationName).toBe('新しい名前');
  });
});

describe('記録一覧のページング', () => {
  it('新しい順に、nextCursor で重複も抜けもなく最後まで読める', async () => {
    const c = await newCreature();
    const ev = await call<EventView>('POST', '/events', 'member', {
      name: 'ページングの会',
      mainLocationId: park.id,
      lat: null,
      lng: null,
      date: '2026-08-01',
      time: '09:00',
    });
    // 同じ日時の記録も混ぜる（登録日時と ID で順番が決まる）
    const times = ['09:10', '09:10', '09:10', '11:00', '08:00', '10:00', '09:10'];
    const created = [];
    for (const time of times) created.push(await newRecord('member', c.id, { eventId: ev.body.id, date: '2026-08-01', time }));

    const seen: RecordView[] = [];
    let cursor: string | null = null;
    do {
      const q: string = `/records?eventId=${ev.body.id}&limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const page = await call<RecordPage>('GET', q, 'viewer');
      expect(page.status).toBe(200);
      expect(page.body.total).toBe(times.length);
      seen.push(...page.body.records);
      cursor = page.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(times.length);
    expect(new Set(seen.map((r) => r.id)).size).toBe(times.length);
    expect(seen.map((r) => r.time)).toEqual([...times].sort().reverse());
    expect(new Set(seen.map((r) => r.id))).toEqual(new Set(created.map((r) => r.id)));
  });

  it('壊れたカーソルは 400、件数の上限を超えると 400', async () => {
    expect((await call('GET', '/records?cursor=abc', 'member')).status).toBe(400);
    expect((await call('GET', '/records?limit=101', 'member')).status).toBe(400);
  });
});

describe('マップ', () => {
  it('座標のある記録だけを、生き物・月・時間帯で絞り込んで返す', async () => {
    const c = await newCreature();
    const night = await newRecord('member', c.id, { date: '2026-06-03', time: '21:00' });
    const lateNight = await newRecord('member', c.id, { date: '2026-06-04', time: '02:00' });
    await newRecord('member', c.id, { date: '2026-06-05', time: '10:00' });
    await newRecord('member', c.id, { date: '2026-07-01', time: '21:00' });
    await newRecord('member', c.id, { locationType: 'none', mainLocationId: null, date: '2026-06-03', time: '22:00' });

    const res = await call<{ records: RecordView[] }>(
      'GET',
      `/records/map?creatureId=${c.id}&month=6&timeOfDay=${encodeURIComponent('夜')}`,
      'viewer',
    );
    expect(res.status).toBe(200);
    expect(res.body.records.map((r) => r.id).sort()).toEqual([night.id, lateNight.id].sort());

    const all = await call<{ records: RecordView[] }>('GET', `/records/map?creatureId=${c.id}`, 'viewer');
    expect(all.body.records).toHaveLength(4);
  });
});

describe('観察会', () => {
  it('部員が作成でき、主な場所の名前と座標が入る。OB・OG は 403', async () => {
    const res = await call<EventView>('POST', '/events', 'member', {
      name: ' 夏の観察会 ',
      mainLocationId: park.id,
      lat: null,
      lng: null,
      date: '2026-07-20',
      time: '10:00',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: '夏の観察会',
      locationName: '中央公園',
      lat: park.lat,
      createdBy: ids.member,
      recordCount: 0,
      creatures: [],
    });

    const denied = await call('POST', '/events', 'viewer', {
      name: '会',
      otherLocationName: '市民の森',
      lat: null,
      lng: null,
      date: '2026-07-20',
      time: '10:00',
    });
    expect(denied.status).toBe(403);
  });

  it('場所がなければ 400', async () => {
    const res = await call('POST', '/events', 'member', { name: '会', lat: null, lng: null, date: '2026-07-20', time: '10:00' });
    expect(res.status).toBe(400);
  });

  it('一覧に記録の件数・生き物・統計が付き、詳細も読める', async () => {
    const ev = await call<EventView>('POST', '/events', 'officer', {
      name: '統計の会',
      otherLocationName: '市民の森',
      lat: 35.15,
      lng: 136.99,
      date: '2099-01-01',
      time: '10:00',
    });
    const a = await newCreature();
    const b = await newCreature();
    await newRecord('member', a.id, { eventId: ev.body.id });
    await newRecord('officer', a.id, { eventId: ev.body.id });
    await newRecord('member', b.id, { eventId: ev.body.id });

    const list = await call<EventListResponse>('GET', '/events', 'viewer');
    expect(list.status).toBe(200);
    // 新しい順なので、2099年の観察会が先頭
    const first = list.body.events[0];
    expect(first).toMatchObject({ id: ev.body.id, locationName: '市民の森', recordCount: 3 });
    expect(first.creatures.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    expect(list.body.stats.eventCount).toBe(list.body.events.length);
    expect(list.body.stats.recordCount).toBe(list.body.events.reduce((s, e) => s + e.recordCount, 0));

    const detail = await call<EventView>('GET', `/events/${ev.body.id}`, 'viewer');
    expect(detail.body.recordCount).toBe(3);
    expect((await call('GET', `/events/00000000-0000-4000-8000-000000000000`, 'viewer')).status).toBe(404);
  });
});

describe('場所別の統計と主な場所', () => {
  it('主な場所ごとに、生き物と観察回数を多い順で返す', async () => {
    const [place] = await ctx.db
      .insert(schema.mainLocations)
      .values({ name: '統計の森', lat: 35.2, lng: 137.0 })
      .returning();
    const a = await newCreature();
    const b = await newCreature();
    await newRecord('member', b.id, { mainLocationId: place.id });
    await newRecord('member', a.id, { mainLocationId: place.id });
    await newRecord('officer', a.id, { mainLocationId: place.id });

    const res = await call<LocationStatsResponse>('GET', '/stats/locations', 'viewer');
    const stats = res.body.locations.find((l) => l.mainLocationId === place.id);
    expect(stats?.creatures.map((x) => [x.id, x.count])).toEqual([
      [a.id, 2],
      [b.id, 1],
    ]);
  });

  it('主な場所の一覧は「使わない」場所も isActive つきで返す', async () => {
    const res = await call<{ locations: { id: string; isActive: boolean }[] }>('GET', '/main-locations', 'viewer');
    expect(res.body.locations.find((l) => l.id === closedPlace.id)?.isActive).toBe(false);
    expect((await call('GET', '/main-locations')).status).toBe(401);
  });
});
