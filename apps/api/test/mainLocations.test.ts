import type { MainLocationView, RecordPage, Role } from '@yamon/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, jsonHeaders, login, setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
const cookies = {} as Record<Role, string>;

beforeAll(async () => {
  ctx = await setupTestApp();
  for (const role of ['admin', 'officer', 'member', 'viewer'] as const) {
    const user = await createUser(ctx.db, { role });
    cookies[role] = await login(ctx, user.email, user.password);
  }
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

let seq = 0;
async function newPlace(extra: Record<string, unknown> = {}) {
  seq += 1;
  const res = await call<MainLocationView>('POST', '/main-locations', 'admin', {
    name: `場所${seq}`,
    lat: 35.13,
    lng: 136.97,
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function newCreature() {
  seq += 1;
  const res = await call<{ id: string }>('POST', '/creatures', 'member', { name: `生き物${seq}`, category: 'アクア' });
  return res.body.id;
}

async function recordAt(placeId: string) {
  const res = await call<{ id: string }>('POST', '/records', 'member', {
    creatureId: await newCreature(),
    locationType: 'main',
    mainLocationId: placeId,
    lat: null,
    lng: null,
    date: '2026-07-01',
    time: '10:00',
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

const list = async () =>
  (await call<{ locations: MainLocationView[] }>('GET', '/main-locations', 'member')).body.locations;

describe('主な場所の追加・編集の権限', () => {
  it('管理者は追加でき、一覧の最後に並ぶ', async () => {
    const a = await newPlace({ name: ' 天白川の河原 ' });
    expect(a).toMatchObject({ name: '天白川の河原', isActive: true, recordCount: 0 });
    const b = await newPlace();
    const ids = (await list()).map((l) => l.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it('幹部・部員・OB・OG は追加も編集もできない（403）、未ログインは 401', async () => {
    const place = await newPlace();
    for (const role of ['officer', 'member', 'viewer'] as const) {
      expect((await call('POST', '/main-locations', role, { name: 'x', lat: 35.1, lng: 136.9 })).status).toBe(403);
      expect((await call('PUT', `/main-locations/${place.id}`, role, { name: 'x', lat: 35.1, lng: 136.9 })).status).toBe(403);
      expect((await call('DELETE', `/main-locations/${place.id}`, role)).status).toBe(403);
    }
    expect((await call('POST', '/main-locations', undefined, { name: 'x', lat: 35.1, lng: 136.9 })).status).toBe(401);
  });

  it('4県の範囲外の座標は保存できない', async () => {
    const tokyo = await call('POST', '/main-locations', 'admin', { name: '東京駅', lat: 35.6812, lng: 139.7671 });
    expect(tokyo.status).toBe(400);
    const place = await newPlace();
    const moved = await call('PUT', `/main-locations/${place.id}`, 'admin', { name: place.name, lat: 35.6812, lng: 139.7671 });
    expect(moved.status).toBe(400);
  });

  it('同じ名前は 409', async () => {
    const place = await newPlace();
    expect((await call('POST', '/main-locations', 'admin', { name: place.name, lat: 35.1, lng: 136.9 })).status).toBe(409);
  });
});

describe('名前の変更と「使わない」', () => {
  it('名前を直すと、過去の記録の表示にも反映される', async () => {
    const place = await newPlace();
    const recordId = await recordAt(place.id);
    const res = await call<MainLocationView>('PUT', `/main-locations/${place.id}`, 'admin', {
      name: '新しい名前の池',
      lat: place.lat,
      lng: place.lng,
    });
    expect(res.status).toBe(200);
    expect(res.body.recordCount).toBe(1);
    const page = await call<RecordPage>('GET', '/records?limit=100', 'member');
    expect(page.body.records.find((r) => r.id === recordId)?.locationName).toBe('新しい名前の池');
  });

  it('「使わない」にした場所は新しい記録・観察会で選べないが、過去の記録と場所別一覧には残る', async () => {
    const place = await newPlace();
    await recordAt(place.id);
    const off = await call<MainLocationView>('PUT', `/main-locations/${place.id}`, 'admin', {
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      isActive: false,
    });
    expect(off.body.isActive).toBe(false);

    const newRecord = await call('POST', '/records', 'member', {
      creatureId: await newCreature(),
      locationType: 'main',
      mainLocationId: place.id,
      lat: null,
      lng: null,
      date: '2026-07-02',
      time: '10:00',
    });
    expect(newRecord.status).toBe(400);
    const newEvent = await call('POST', '/events', 'member', {
      name: '会',
      mainLocationId: place.id,
      lat: null,
      lng: null,
      date: '2026-07-02',
      time: '10:00',
    });
    expect(newEvent.status).toBe(400);

    expect((await list()).find((l) => l.id === place.id)?.isActive).toBe(false);
    const stats = await call<{ locations: { mainLocationId: string }[] }>('GET', '/stats/locations', 'member');
    expect(stats.body.locations.some((l) => l.mainLocationId === place.id)).toBe(true);
  });

  it('編集で isActive を省くと、今の状態のまま（「使わない」が勝手に戻らない）', async () => {
    const place = await newPlace({ isActive: false });
    const res = await call<MainLocationView>('PUT', `/main-locations/${place.id}`, 'admin', {
      name: `${place.name}改`,
      lat: place.lat,
      lng: place.lng,
    });
    expect(res.body).toMatchObject({ name: `${place.name}改`, isActive: false });
  });
});

describe('削除', () => {
  it('記録がない場所は削除できる', async () => {
    const place = await newPlace();
    expect((await call('DELETE', `/main-locations/${place.id}`, 'admin')).status).toBe(204);
    expect((await list()).some((l) => l.id === place.id)).toBe(false);
  });

  it('記録または観察会がある場所は削除できない（409）', async () => {
    const withRecord = await newPlace();
    await recordAt(withRecord.id);
    expect((await call('DELETE', `/main-locations/${withRecord.id}`, 'admin')).status).toBe(409);

    const withEvent = await newPlace();
    await call('POST', '/events', 'member', {
      name: '会',
      mainLocationId: withEvent.id,
      lat: null,
      lng: null,
      date: '2026-07-02',
      time: '10:00',
    });
    expect((await list()).find((l) => l.id === withEvent.id)).toMatchObject({ recordCount: 0, eventCount: 1 });
    expect((await call('DELETE', `/main-locations/${withEvent.id}`, 'admin')).status).toBe(409);
  });
});
