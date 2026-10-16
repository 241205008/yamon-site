import { blurCoordinate, type CreatureView, type RecordPage, type RecordView, type Role } from '@yamon/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../src/db/client';
import { createUser, jsonHeaders, login, setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
const cookies = {} as Record<Role | 'graduate', string>;
const ids = {} as Record<Role | 'graduate', string>;

// 名古屋市天白区周辺（主な場所と同じ辺り）の、丸める前の正確な位置
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

async function recordBy(who: Who, creatureId: string) {
  const res = await call<RecordView>('POST', '/records', who, {
    creatureId,
    locationType: 'other',
    otherLocationName: '池のほとり',
    ...EXACT,
    date: '2026-06-01',
    time: '20:00',
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function seenBy(who: Who, recordId: string) {
  const page = await call<RecordPage>('GET', '/records?limit=100', who);
  const fromList = page.body.records.find((r) => r.id === recordId)!;
  const map = await call<{ records: RecordView[] }>('GET', '/records/map', who);
  const fromMap = map.body.records.find((r) => r.id === recordId)!;
  return { fromList, fromMap, raw: JSON.stringify(page.body) + JSON.stringify(map.body) };
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
});

describe('保護対象の記録の位置', () => {
  it('部員・OB・OG には約1km単位に丸めた位置を返し、正確な座標は応答のどこにも含めない', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    const rec = await recordBy('officer', c.id);
    for (const who of ['member', 'viewer'] as const) {
      const { fromList, fromMap, raw } = await seenBy(who, rec.id);
      const blurred = { lat: blurCoordinate(EXACT.lat), lng: blurCoordinate(EXACT.lng), approximate: true };
      expect(fromList).toMatchObject(blurred);
      expect(fromMap).toMatchObject(blurred);
      expect(raw).not.toContain(String(EXACT.lat));
      expect(raw).not.toContain(String(EXACT.lng));
    }
  });

  it('管理者・幹部には正確な位置を返す', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    const rec = await recordBy('member', c.id);
    for (const who of ['admin', 'officer'] as const) {
      const { fromList, fromMap } = await seenBy(who, rec.id);
      expect(fromList).toMatchObject({ ...EXACT, approximate: false });
      expect(fromMap).toMatchObject({ ...EXACT, approximate: false });
    }
  });

  it('記録した本人には、OB・OG になった後も正確な位置を返す', async () => {
    const c = (await creature('officer', { locationProtected: true })).body;
    const rec = await recordBy('graduate', c.id);
    expect(rec).toMatchObject({ ...EXACT, approximate: false });
    await ctx.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, ids.graduate));
    const { fromList } = await seenBy('graduate', rec.id);
    expect(fromList).toMatchObject({ ...EXACT, approximate: false });
    // 他の部員には丸めた位置
    expect((await seenBy('member', rec.id)).fromList.approximate).toBe(true);
  });

  it('保護対象でない生き物の記録は、だれにでも正確な位置を返す', async () => {
    const c = (await creature('member')).body;
    const rec = await recordBy('officer', c.id);
    expect((await seenBy('viewer', rec.id)).fromList).toMatchObject({ ...EXACT, approximate: false });
  });
});

describe('blurCoordinate', () => {
  it('0.01度の区画の中心に寄せる（区画の中ならどこでも同じ値）', () => {
    expect(blurCoordinate(35.13872)).toBe(35.135);
    expect(blurCoordinate(35.13001)).toBe(35.135);
    expect(blurCoordinate(35.12)).toBe(35.125);
    expect(blurCoordinate(136.97641)).toBe(136.975);
  });
});
