import type { MapDataRun, MapDataStatus } from '@yamon/shared';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app';
import { errorBody } from '../errors';
import { GitHubApiError, type MapDataWorkflow } from './github';

export interface MapDataDeps {
  /** なければ（GitHub の鍵が未設定なら）503 を返す */
  workflow?: MapDataWorkflow;
  /**
   * 管理者だけを通すミドルウェア（#11 の requirePermission('mapData.update')）。
   * 渡されなければ、誰も通さない（仮の実装で誰でも更新できる状態を作らない。D33 の7）
   */
  authorize?: MiddlewareHandler<AppEnv>;
}

const denyAll: MiddlewareHandler<AppEnv> = async (c) =>
  c.json(errorBody('forbidden', '地図データを更新する権限の確認が、まだ用意されていません'), 403);

function toStatus(run: MapDataRun | null): MapDataStatus {
  return { state: run ? run.state : 'idle', run };
}

/** /api/admin/map-data：管理者が地図データを更新する（D33） */
export function mapDataRoutes({ workflow, authorize = denyAll }: MapDataDeps) {
  const routes = new Hono<AppEnv>();
  routes.use('*', authorize);

  routes.use('*', async (c, next) => {
    if (!workflow) {
      return c.json(errorBody('not_configured', '地図データの更新が設定されていません（GITHUB_MAP_DATA_TOKEN）'), 503);
    }
    await next();
  });

  // GitHub の失敗は 502 にする（ハンドラーで投げた例外は、前段のミドルウェアでは捕まえられないため、ここで包む）
  const withGitHub =
    (handler: (c: Context<AppEnv>, wf: MapDataWorkflow) => Promise<Response>) => async (c: Context<AppEnv>) => {
      try {
        return await handler(c, workflow!);
      } catch (err) {
        if (!(err instanceof GitHubApiError)) throw err;
        console.error(err.message);
        return c.json(
          errorBody('github_error', '地図データの更新の状態を確認できませんでした。しばらくしてからやり直してください'),
          502,
        );
      }
    };

  routes.get('/status', withGitHub(async (c, wf) => c.json(toStatus(await wf.latestRun()))));

  routes.post(
    '/refresh',
    withGitHub(async (c, wf) => {
      // フォームからの送信（CSRF）を通さないため、状態を変える API は JSON に限る（#11 と同じ決まり）
      if (!c.req.header('Content-Type')?.startsWith('application/json')) {
        throw new HTTPException(415, { message: 'Content-Type: application/json で送ってください' });
      }
      const latest = await wf.latestRun();
      if (latest?.state === 'running') {
        return c.json(
          { ...errorBody('conflict', '地図データを更新中です。終わるまでお待ちください'), status: toStatus(latest) },
          409,
        );
      }
      const started = await wf.dispatch();
      // 起動した直後は、一覧にまだ出ないことがある。返ってきた情報があればそれを使う
      const run: MapDataRun | null = started
        ? { id: started.id, state: 'running', startedAt: new Date().toISOString(), finishedAt: null, url: started.url }
        : null;
      const status: MapDataStatus = { state: 'running', run };
      return c.json(status, 202);
    }),
  );

  return routes;
}
