import { serve } from '@hono/node-server';
import { createApp } from './app';
import { connectPglite, connectPostgres, type DbHandle } from './db/client';

const isProduction = process.env.NODE_ENV === 'production';
// 本番は Cloud Run が渡す PORT を使う。開発では PORT（ほかのツールが使うことが多い）を見ず、
// API_PORT（既定 8787。apps/web/vite.config.ts の転送先と同じ）を使う
const port = Number(isProduction ? (process.env.PORT ?? 8080) : (process.env.API_PORT ?? 8787));
const databaseUrl = process.env.DATABASE_URL;

async function connect(): Promise<DbHandle> {
  if (databaseUrl) return connectPostgres(databaseUrl);
  if (isProduction) {
    throw new Error('DATABASE_URL が設定されていません');
  }
  // ローカル開発：Docker なしで動くよう、PGlite のデータをフォルダに保存する（起動時にマイグレーションを流す）
  const dataDir = process.env.PGLITE_DIR ?? '.data/pglite';
  console.log(`DATABASE_URL がないため、PGlite（${dataDir}）を使います`);
  return connectPglite(dataDir);
}

const handle = await connect();
const app = createApp({ db: handle.db, log: true });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API: http://localhost:${info.port}/api/health`);
});

// Cloud Run は停止前に SIGTERM を送る。受け付け中のリクエストを終えてから DB の接続を閉じる
const shutdown = () => {
  server.close(() => {
    handle.close().finally(() => process.exit(0));
  });
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
