import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/** 本番（postgres.js）とテスト・ローカル（PGlite）のどちらの接続でも受け取れる DB の型 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export { schema };

/** 本番ビルド（build.mjs）が dist/ から見た drizzle/ の位置に置き換える */
declare const __MIGRATIONS_RELATIVE_PATH__: string | undefined;

/** マイグレーションの置き場所（drizzle-kit generate の出力先 apps/api/drizzle） */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL(
    typeof __MIGRATIONS_RELATIVE_PATH__ === 'string' ? __MIGRATIONS_RELATIVE_PATH__ : '../../drizzle',
    import.meta.url,
  ),
);

export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
}

/**
 * DATABASE_URL の PostgreSQL（本番は Neon、D17）につなぐ。
 * 本番ではサーバーの起動時にマイグレーションを流さない（複数のインスタンスが同時に流すのを防ぐ）。
 * migrate: true は `npm run db:migrate`（src/migrate.ts）から使う
 */
export async function connectPostgres(url: string, options: { migrate?: boolean } = {}): Promise<DbHandle> {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  // NOTICE（「既にある」など）はログに出さない
  const client = postgres(url, { max: 5, onnotice: () => {} });
  const db = drizzle(client, { schema });
  if (options.migrate) {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  return { db, close: () => client.end() };
}

/**
 * PGlite（WebAssembly 版の PostgreSQL）につなぎ、マイグレーションを流す。
 * dataDir を省くとメモリ上に作る（テスト用）。ローカル開発ではフォルダに保存する。
 * PGlite は開発用の依存なので、本番のビルドには含めない（esbuild の external）。
 */
export async function connectPglite(dataDir?: string): Promise<DbHandle> {
  const { PGlite } = await import('@electric-sql/pglite');
  // PGlite は親フォルダまでは作らないので、先に作っておく
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close() };
}
