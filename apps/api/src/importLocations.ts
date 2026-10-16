/**
 * 主な場所の一覧（CSV：名前,緯度,経度）を DB に入れる（幹部から届いた一覧を初期データにする、#23）。
 *
 *   npm run db:import-locations -w @yamon/api -- 一覧.csv            # 確認だけ（DB は変えない）
 *   npm run db:import-locations -w @yamon/api -- 一覧.csv --apply    # 実際に入れる
 *
 * DATABASE_URL があればその DB（本番は Neon）、なければローカルの PGlite に入れる。
 * 同じ名前の場所が既にあれば飛ばす（何度流しても重複しない）。1行でも誤りがあれば、何も入れない。
 * 登録した後の追加・編集は、管理者画面の「主な場所」から行う
 */
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { connectPglite, connectPostgres, schema } from './db/client';
import { parseLocationsCsv } from './mainLocations/csv';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
if (!file) {
  console.error('使い方：npm run db:import-locations -w @yamon/api -- <CSV ファイル> [--apply]');
  process.exit(1);
}

const { locations, errors } = parseLocationsCsv(readFileSync(file, 'utf8'));
if (errors.length > 0) {
  console.error('CSV に誤りがあるため、何も入れません：');
  for (const e of errors) console.error(`  ${e.line}行目：${e.message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const handle = url ? await connectPostgres(url) : await connectPglite(process.env.PGLITE_DIR ?? '.data/pglite');
console.log(url ? 'DATABASE_URL の DB に接続しました' : 'ローカルの PGlite に接続しました');

try {
  const { mainLocations } = schema;
  const existing = new Set((await handle.db.select({ name: mainLocations.name }).from(mainLocations)).map((l) => l.name));
  const toAdd = locations.filter((l) => !existing.has(l.name));
  for (const l of locations) {
    console.log(`  ${existing.has(l.name) ? '登録済み（飛ばす）' : '追加する'}：${l.name}（${l.lat}, ${l.lng}）`);
  }

  if (!apply) {
    console.log(`確認のみ：${toAdd.length}件を追加します。入れるときは --apply を付けて実行してください`);
  } else if (toAdd.length > 0) {
    // 既存の場所の後ろに、CSV の順番のまま並べる
    await handle.db.transaction(async (tx) => {
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${mainLocations.sortOrder}), -1) + 1` })
        .from(mainLocations);
      await tx.insert(mainLocations).values(toAdd.map((l, i) => ({ ...l, sortOrder: Number(next) + i })));
    });
    console.log(`${toAdd.length}件の主な場所を追加しました`);
  } else {
    console.log('追加する場所はありません');
  }
} finally {
  await handle.close();
}
