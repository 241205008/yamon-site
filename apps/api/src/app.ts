import type { SessionUser } from '@yamon/shared';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Db } from './db/client';
import { errorBody, handleError } from './errors';
import { authRoutes } from './routes/auth';

export interface AppEnv {
  Variables: {
    db: Db;
    /** セッションの Cookie に Secure を付けるか */
    cookieSecure: boolean;
    /** ログイン中のユーザー。まだ調べていなければ undefined、未ログインなら null（auth/middleware.ts） */
    user?: SessionUser | null;
  };
}

export interface AppDeps {
  db: Db;
  /** リクエストごとにログを出す（サーバーの起動時だけ。テストでは出さない） */
  log?: boolean;
  /**
   * セッションの Cookie に Secure（HTTPS のときだけ送る）を付けるか。既定は付ける。
   * 開発（http://localhost）では付けない（Safari は localhost でも Secure の Cookie を送らない）
   */
  cookieSecure?: boolean;
}

/** 状態を変えるメソッド。CSRF 対策で、本文は JSON に限る */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * API のアプリ本体。DB は外から渡す（本番は Neon、テストとローカルは PGlite）。
 * 各機能のルートは、この関数の中で app.route() でつなぐ。
 */
export function createApp({ db, log = false, cookieSecure = true }: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  if (log) app.use(logger());
  app.use(secureHeaders());
  app.use(async (c, next) => {
    c.set('db', db);
    c.set('cookieSecure', cookieSecure);
    await next();
  });
  // CSRF 対策（D33）：Cookie は SameSite=Lax だが、さらに状態を変えるリクエストは Content-Type: application/json に限る。
  // 他のサイトのフォームは JSON を送れず、他のサイトの fetch で JSON を送ると事前確認（CORS）で止まる
  app.use(async (c, next) => {
    if (UNSAFE_METHODS.has(c.req.method)) {
      const type = c.req.header('content-type') ?? '';
      if (!/^application\/json\s*(;|$)/i.test(type)) {
        throw new HTTPException(415, { message: '本文は JSON（Content-Type: application/json）で送ってください' });
      }
    }
    await next();
  });

  // DB には触らない。外部の死活監視が叩いても、止まっている Neon を起こさない（D14 の起動待ち・無料枠）
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.route('/auth', authRoutes);

  app.notFound((c) => c.json(errorBody('not_found', '見つかりません'), 404));
  app.onError(handleError);

  return app;
}
