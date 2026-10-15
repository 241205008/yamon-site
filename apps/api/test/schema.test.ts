import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../src/db/client';
import { setupTestApp, type TestContext } from './helpers';

const { users, creatures, events, observationRecords, mainLocations } = schema;

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(() => ctx.close());

/** 制約違反などで失敗した SQL のエラーコード（PostgreSQL の SQLSTATE）を取り出す */
async function pgErrorCode(promise: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code;
  }
  return undefined;
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

function insertUser(email: string) {
  return ctx.db.insert(users).values({ name: 'テスト', email, passwordHash: 'x' }).returning();
}

describe('マイグレーション', () => {
  it('MVP 5章のテーブルがすべてできる', async () => {
    // execute の戻り値の形はドライバーごとに違う（Db 型では unknown）。PGlite は rows に入る
    const result = (await ctx.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )) as { rows: { table_name: string }[] };
    expect(result.rows.map((r) => r.table_name)).toEqual([
      'audit_logs',
      'creatures',
      'events',
      'invitations',
      'main_locations',
      'observation_records',
      'password_reset_tokens',
      'sessions',
      'users',
    ]);
  });
});

describe('ユーザー', () => {
  it('メールアドレスは大文字・小文字を区別せずに重複できない', async () => {
    await insertUser('dup@example.com');
    expect(await pgErrorCode(insertUser('DUP@example.com'))).toBe(UNIQUE_VIOLATION);
  });

  it('退会したユーザーにメールアドレスやパスワードを残せない（D26）', async () => {
    const [u] = await insertUser('withdraw@example.com');
    const keepEmail = ctx.db
      .update(users)
      .set({ status: 'withdrawn', withdrawnAt: new Date() })
      .where(eq(users.id, u!.id));
    expect(await pgErrorCode(keepEmail)).toBe(CHECK_VIOLATION);

    await ctx.db
      .update(users)
      .set({ status: 'withdrawn', name: '退会済みユーザー', email: null, passwordHash: null, withdrawnAt: new Date() })
      .where(eq(users.id, u!.id));
    const [after] = await ctx.db.select().from(users).where(eq(users.id, u!.id));
    expect(after).toMatchObject({ status: 'withdrawn', email: null, passwordHash: null });
  });
});

describe('観察記録', () => {
  async function fixtures() {
    const [u] = await insertUser(`rec-${crypto.randomUUID()}@example.com`);
    const [c] = await ctx.db.insert(creatures).values({ name: 'カブトムシ', category: 'インセクター' }).returning();
    const [loc] = await ctx.db.insert(mainLocations).values({ name: '庄内緑地', lat: 35.19, lng: 136.87 }).returning();
    const [ev] = await ctx.db
      .insert(events)
      .values({ name: '夏の観察会', date: '2026-08-01', time: '09:00', createdBy: u!.id })
      .returning();
    return { userId: u!.id, creatureId: c!.id, locationId: loc!.id, eventId: ev!.id };
  }

  it('観察会を削除しても記録は残り、観察会との紐づけだけ外れる（#7）', async () => {
    const f = await fixtures();
    const [r] = await ctx.db
      .insert(observationRecords)
      .values({
        creatureId: f.creatureId,
        eventId: f.eventId,
        locationType: 'none',
        date: '2026-08-01',
        time: '09:30',
        userId: f.userId,
      })
      .returning();

    await ctx.db.delete(events).where(eq(events.id, f.eventId));
    const [after] = await ctx.db.select().from(observationRecords).where(eq(observationRecords.id, r!.id));
    expect(after?.eventId).toBeNull();
  });

  it('記録がある生き物と主な場所は削除できない（D9・D27）', async () => {
    const f = await fixtures();
    await ctx.db.insert(observationRecords).values({
      creatureId: f.creatureId,
      locationType: 'main',
      mainLocationId: f.locationId,
      date: '2026-08-01',
      time: '10:00',
      userId: f.userId,
    });
    expect(await pgErrorCode(ctx.db.delete(creatures).where(eq(creatures.id, f.creatureId)))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
    expect(await pgErrorCode(ctx.db.delete(mainLocations).where(eq(mainLocations.id, f.locationId)))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('座標は緯度と経度をそろえて持つ。主な場所の記録には場所の ID が要る', async () => {
    const f = await fixtures();
    const base = { creatureId: f.creatureId, date: '2026-08-01', time: '11:00', userId: f.userId };
    const onlyLat = ctx.db.insert(observationRecords).values({ ...base, locationType: 'other', lat: 35.1 });
    expect(await pgErrorCode(onlyLat)).toBe(CHECK_VIOLATION);
    const mainWithoutId = ctx.db.insert(observationRecords).values({ ...base, locationType: 'main' });
    expect(await pgErrorCode(mainWithoutId)).toBe(CHECK_VIOLATION);
  });

  it('日付と時刻は JST の文字列のまま読み書きできる（D10）', async () => {
    const f = await fixtures();
    const [r] = await ctx.db
      .insert(observationRecords)
      .values({ creatureId: f.creatureId, locationType: 'none', date: '2026-12-31', time: '23:59', userId: f.userId })
      .returning();
    expect(r).toMatchObject({ date: '2026-12-31', time: '23:59:00' });
  });
});
