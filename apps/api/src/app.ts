import type { SessionUser } from '@yamon/shared';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { sameSecret } from './auth/session';
import type { Db } from './db/client';
import type { Mailer } from './mail';
import { errorBody, handleError } from './errors';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { invitationRoutes } from './routes/invitations';
import { creatureRoutes } from './routes/creatures';
import { eventRoutes } from './routes/events';
import { mainLocationRoutes, statsRoutes } from './routes/locations';
import { recordRoutes } from './routes/records';
import { mapDataRoutes, type MapDataDeps } from './mapData/routes';
import { passwordResetRoutes } from './routes/passwordReset';
import { setupRoutes } from './routes/setup';

export interface AppEnv {
  Variables: {
    db: Db;
    /** メールの送り方。設定がなければ undefined（リンクは管理者画面にだけ出す、D46） */
    mailer: Mailer | undefined;
    /** メールに入れるリンクの起点（例 https://yamon.pages.dev）。なければリクエストの Origin を使う */
    appUrl: string | undefined;
    /** 初回セットアップのトークン（環境変数 SETUP_TOKEN）。なければ初回セットアップはできない */
    setupToken: string | undefined;
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
  /** メールの送り方（mail.ts）。既定は送らない（招待・再設定のリンクは管理者画面にだけ出す、D46） */
  mailer?: Mailer;
  /** メールに入れるリンクの起点（環境変数 APP_URL） */
  appUrl?: string;
  /** 初回セットアップのトークン（環境変数 SETUP_TOKEN、D37） */
  setupToken?: string;
  /** 地図データの更新（D34）。GitHub の鍵と権限チェック。なければ 503 / 403 を返す */
  mapData?: MapDataDeps;
  /**
   * Cloudflare の Worker と共有する秘密の値（環境変数 PROXY_SECRET、D44）。
   * 渡したときは、PROXY_SECRET_HEADER に同じ値が付いたリクエストだけを受け付ける（Cloud Run への直接のアクセスを断る）
   */
  proxySecret?: string;
}

/** Worker（apps/web/worker/api/proxy.ts）が秘密の値を入れるヘッダー。名前は Worker 側と同じにする */
export const PROXY_SECRET_HEADER = 'x-yamon-proxy-secret';

/** 状態を変えるメソッド。CSRF 対策で、本文は JSON に限る */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * API のアプリ本体。DB は外から渡す（本番は Neon、テストとローカルは PGlite）。
 * 各機能のルートは、この関数の中で app.route() でつなぐ。
 */
export function createApp({
  db,
  log = false,
  cookieSecure = true,
  mailer,
  appUrl,
  setupToken,
  mapData = {},
  proxySecret,
}: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  if (log) app.use(logger());
  app.use(secureHeaders());
  // 入口を Worker 経由に限る（D44）。ヘルスチェックも含めて、すべてのパスで確かめる
  if (proxySecret) {
    app.use(async (c, next) => {
      const received = c.req.header(PROXY_SECRET_HEADER);
      if (received === undefined || !sameSecret(received, proxySecret)) {
        return c.json(errorBody('forbidden', '直接のアクセスは受け付けていません'), 403);
      }
      await next();
    });
  }
  app.use(async (c, next) => {
    c.set('db', db);
    c.set('cookieSecure', cookieSecure);
    c.set('mailer', mailer);
    c.set('appUrl', appUrl);
    c.set('setupToken', setupToken);
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
  app.route('/setup', setupRoutes);
  app.route('/password-reset', passwordResetRoutes);
  app.route('/creatures', creatureRoutes);
  app.route('/events', eventRoutes);
  app.route('/records', recordRoutes);
  app.route('/main-locations', mainLocationRoutes);
  app.route('/stats', statsRoutes);
  app.route('/invitations', invitationRoutes);
  // /admin/map-data を先につなぐ（後の /admin の users.manage のチェックより先に、地図データの権限で判定する）
  app.route('/admin/map-data', mapDataRoutes(mapData));
  app.route('/admin', adminRoutes);

  app.notFound((c) => c.json(errorBody('not_found', '見つかりません'), 404));
  app.onError(handleError);

  return app;
}
