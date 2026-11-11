import type { CreatureView, EventView, LocationStatsResponse, RecordPage, RecordView, Role } from '@yamon/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../src/db/client';
import { createUser, jsonHeaders, login, setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
const cookies = {} as Record<Role | 'graduate', string>;
const ids = {} as Record<Role | 'graduate', string>;
let parkId: string;
const PARK = { name: '秘密の湿地公園', lat: 35.14111, lng: 136.98222 };

// 名古屋市天白区周辺の正確な位置（部員・OB・OG の応答には、この値も丸めた値も出さない）
const EXACT = { lat: 35.13872, lng: 136.97641 };

beforeAll(async () => {
  ctx = await setupTestApp();
  for (const role of ['admin', 'officer', 'member', 'viewer'] as const) {
    const user = await createUser(ctx.db, { role });
    ids[role] = user.id;
    cookies[role] = await login(ctx, user.email, user.password);
  }
  // 部員のときに記録し、その後 OB・OG になる人
  const graduate = await createUser(ctx.db, { role: 'member' });
  ids.graduate = graduate.id;
  cookies.graduate = await login(ctx, graduate.email, graduate.password);
  [{ id: parkId }] = await ctx.db.insert(schema.mainLocations).values(PARK).returning();
});
afterAll(() => ctx.close());

type Who = Role | 'graduate';
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

let seq = 0;
async function creature(who: Who, extra: Record<string, unknown> = {}) {
  seq += 1;
  return call<CreatureView>('POST', '/creatures', who, { name: `希少種${seq}`, category: 'アクア', ...extra });
}

const OTHER_PLACE = '池のほとり';

async function recordBy(who: Who, creatureId: string, extra: Record<string, unknown> = {}) {
  const res = await call<RecordView>('POST', '/records', who, {
    creatureId,
    locationType: 'other',
    otherLocationName: OTHER_PLACE,
    ...EXACT,
    date: '2026-06-01',
    time: '20:00',
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body;
}

/** 一覧とマップで、その記録がどう見えるか。raw は応答の全文（漏れを文字列で確かめる） */
async function seenBy(who: Who, recordId: string) {
  const page = await call<RecordPage>('GET', '/records?limit=100', who);
  const fromList = page.body.records.find((r) => r.id === recordId)!;
  const map = await call<{ records: RecordView[] }>('GET', '/records/map', who);
  const fromMap = map.body.records.find((r) => r.id === recordId);
  return { fromList, fromMap, raw: JSON.stringify(page.body) + JSON.stringify(map.body) };
}

const HIDDEN = { locationHidden: true, locationType: null, mainLocationId: null, locationName: '', lat: null, lng: null };

/**
 * 応答の全文に、正確な座標・丸めた座標・場所名・主な場所の ID が含まれない。
 * 丸めた座標は、小数2桁の四捨五入（35.14）と切り捨て（35.13。D39 の区画の中心 35.135 もこれで見つかる）の両方を見る
 */
function expectNoLocation(raw: string, place: { lat: number; lng: number; name: string; id?: string }) {
  for (const v of [place.lat, place.lng]) {
    expect(raw).not.toContain(String(v));
    expect(raw).not.toContain(v.toFixed(2));
    expect(raw).not.toContain((Math.floor(v * 100) / 100).toFixed(2));
  }
  expect(raw).not.toContain(place.name);
  if (place.id) expect(raw).not.toContain(place.id);
}

describe('「位置を保護する」印', () => {
  it('管理者・幹部は付け外しでき、部員は付けられない（403）', async () => {
    expect((await creature('officer', { locationProtected: true })).body.locationProtected).toBe(true);
    expect((await creature('member', { locationProtected: true })).status).toBe(403);

    const plain = (await creature('member')).body;
    const byMember = await call('PUT', `/creatures/${plain.id}`, 'member', {
      name: plain.name,
      category: plain.category,
      locationProtected: true,
    });
    expect(byMember.status).toBe(403);
    const byAdmin = await call<CreatureView>('PUT', `/creatures/${plain.id}`, 'admin', {
      name: plain.name,
      category: plain.category,
      locationProtected: true,
    });
    expect(byAdmin.body.locationProtected).toBe(true);
  });

  it('部員が印に触れずに名前を直しても、印はそのまま', async () => {
    const protectedOne = (await creature('admin', { locationProtected: true })).body;
    const res = await call<CreatureView>('PUT', `/creatures/${protectedOne.id}`, 'member', {
      name: `${protectedOne.name}改`,
      category: protectedOne.category,
    });
    expect(res.status).toBe(200);
    expect(res.body.locationProtected).toBe(true);
    // 同じ値を送るのは変更ではないので通す
    const same = await call('PUT', `/creatures/${protectedOne.id}`, 'member', {
      name: `${protectedOne.name}改`,
      category: protectedOne.category,
      locationProtected: true,
    });
    expect(same.status).toBe(200);
  });

  it('PATCH でも、印を付け外しできるのは管理者・幹部だけ。部員が印を送らずに変えても印はそのまま（#99）', async () => {
    const plain = (await creature('member')).body;
    expect((await call('PATCH', `/creatures/${plain.id}`, 'member', { locationProtected: true })).status).toBe(403);
    const byOfficer = await call<CreatureView>('PATCH', `/creatures/${plain.id}`, 'officer', { locationProtected: true });
    expect(byOfficer.body).toMatchObject({ locationProtected: true, name: plain.name });

    const memo = await call<CreatureView>('PATCH', `/creatures/${plain.id}`, 'member', { memo: '巣の場所は書かない' });
    expect(memo.status).toBe(200);
    expect(memo.body.locationProtected).toBe(true);
    // 同じ値を送るのは変更ではないので通す
    expect((await call('PATCH', `/creatures/${plain.id}`, 'member', { locationProtected: true })).status).toBe(200);
  });
});

describe('保護対象の記録の位置（D52）', () => {
  it('部員・OB・OG には、その他の場所の記録の場所名・座標を返さず、マップにも出さない', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    const rec = await recordBy('officer', c.id);
    for (const who of ['member', 'viewer'] as const) {
      const { fromList, fromMap, raw } = await seenBy(who, rec.id);
      expect(fromList).toMatchObject({ ...HIDDEN, creatureName: c.name, date: '2026-06-01', time: '20:00' });
      expect(fromMap).toBeUndefined();
      expectNoLocation(raw, { ...EXACT, name: OTHER_PLACE });
    }
  });

  it('部員・OB・OG には、主な場所の記録の主な場所（ID・名前・座標）を返さない', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    const rec = await recordBy('officer', c.id, { locationType: 'main', mainLocationId: parkId, lat: null, lng: null });
    expect(rec).toMatchObject({ mainLocationId: parkId, lat: PARK.lat });
    for (const who of ['member', 'viewer'] as const) {
      const { fromList, fromMap, raw } = await seenBy(who, rec.id);
      expect(fromList).toMatchObject(HIDDEN);
      expect(fromMap).toBeUndefined();
      expectNoLocation(raw, { ...PARK, id: parkId });
    }
  });

  it('観察会との紐づけは返す（観察会の詳細の記録一覧に出る。2026-11-10 ユーザー決定）', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    const ev = await call<EventView>('POST', '/events', 'officer', {
      name: '夜の観察会',
      otherLocationName: '川沿い',
      lat: null,
      lng: null,
      date: '2026-06-01',
      time: '19:00',
    });
    const rec = await recordBy('officer', c.id, { eventId: ev.body.id });
    const page = await call<RecordPage>('GET', `/records?eventId=${ev.body.id}`, 'member');
    expect(page.body.records.find((r) => r.id === rec.id)).toMatchObject({ ...HIDDEN, eventId: ev.body.id });
    expectNoLocation(JSON.stringify(page.body), { ...EXACT, name: OTHER_PLACE });
  });

  it('場所別の一覧には、保護対象の生き物も出す（2026-11-10 ユーザー決定）', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    await recordBy('officer', c.id, { locationType: 'main', mainLocationId: parkId, lat: null, lng: null });
    const stats = await call<LocationStatsResponse>('GET', '/stats/locations', 'member');
    const park = stats.body.locations.find((l) => l.mainLocationId === parkId)!;
    expect(park.creatures.map((x) => x.id)).toContain(c.id);
  });

  it('管理者・幹部には正確な位置を返し、マップにも出す', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    const rec = await recordBy('member', c.id);
    for (const who of ['admin', 'officer'] as const) {
      const { fromList, fromMap } = await seenBy(who, rec.id);
      const exact = { ...EXACT, locationName: OTHER_PLACE, locationType: 'other', locationHidden: false };
      expect(fromList).toMatchObject(exact);
      expect(fromMap).toMatchObject(exact);
    }
  });

  it('記録した本人には、OB・OG になった後も正確な位置を返す', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    const rec = await recordBy('graduate', c.id);
    expect(rec).toMatchObject({ ...EXACT, locationHidden: false });
    await ctx.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, ids.graduate));
    const { fromList, fromMap } = await seenBy('graduate', rec.id);
    expect(fromList).toMatchObject({ ...EXACT, locationName: OTHER_PLACE, locationHidden: false });
    expect(fromMap).toMatchObject({ ...EXACT, locationHidden: false });
    // 他の部員には隠す
    expect((await seenBy('member', rec.id)).fromList).toMatchObject(HIDDEN);
  });

  it('保護対象でない生き物の記録は、だれにでも正確な位置を返す', async () => {
    const c = (await creature('member')).body;
    const rec = await recordBy('officer', c.id);
    const { fromList, fromMap } = await seenBy('viewer', rec.id);
    expect(fromList).toMatchObject({ ...EXACT, locationName: OTHER_PLACE, locationHidden: false });
    expect(fromMap).toMatchObject({ ...EXACT, locationHidden: false });
  });
});
