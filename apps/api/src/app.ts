import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Db } from './db/client';
import { errorBody, handleError } from './errors';
import { mapDataRoutes, type MapDataDeps } from './mapData/routes';

export interface AppEnv {
  Variables: { db: Db };
}

export interface AppDeps {
  db: Db;
  /** リクエストごとにログを出す（サーバーの起動時だけ。テストでは出さない） */
  log?: boolean;
  /** 地図データの更新（D33）。GitHub の鍵と権限チェック。なければ 503 / 403 を返す */
  mapData?: MapDataDeps;
}

/**
 * API のアプリ本体。DB は外から渡す（本番は Neon、テストとローカルは PGlite）。
 * 各機能のルートは、この関数の中で app.route() でつなぐ。
 */
export function createApp({ db, log = false, mapData = {} }: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  if (log) app.use(logger());
  app.use(secureHeaders());
  app.use(async (c, next) => {
    c.set('db', db);
    await next();
  });

  // DB には触らない。外部の死活監視が叩いても、止まっている Neon を起こさない（D14 の起動待ち・無料枠）
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.route('/admin/map-data', mapDataRoutes(mapData));

  app.notFound((c) => c.json(errorBody('not_found', '見つかりません'), 404));
  app.onError(handleError);

  return app;
}
