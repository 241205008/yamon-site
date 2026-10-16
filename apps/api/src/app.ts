import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Db } from './db/client';
import { errorBody, handleError } from './errors';

export interface AppEnv {
  Variables: { db: Db };
}

export interface AppDeps {
  db: Db;
  /** リクエストごとにログを出す（サーバーの起動時だけ。テストでは出さない） */
  log?: boolean;
}

/**
 * API のアプリ本体。DB は外から渡す（本番は Neon、テストとローカルは PGlite）。
 * 各機能のルートは、この関数の中で app.route() でつなぐ。
 */
export function createApp({ db, log = false }: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  if (log) app.use(logger());
  app.use(secureHeaders());
  app.use(async (c, next) => {
    c.set('db', db);
    await next();
  });

  // DB には触らない。外部の死活監視が叩いても、止まっている Neon を起こさない（D14 の起動待ち・無料枠）
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.notFound((c) => c.json(errorBody('not_found', '見つかりません'), 404));
  app.onError(handleError);

  return app;
}
