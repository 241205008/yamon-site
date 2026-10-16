import type { MapDataRun, MapDataStatus } from '@yamon/shared';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { AuthedEnv } from '../auth/middleware';
import { errorBody } from '../errors';
import { GitHubApiError, type MapDataWorkflow } from './github';

export interface MapDataDeps {
  /** なければ（GitHub の鍵が未設定なら）503 を返す */
  workflow?: MapDataWorkflow;
  /**
   * 管理者だけを通すミドルウェア。本番は requirePermission('mapData.update')（src/index.ts）。
   * 渡されなければ、誰も通さない（設定漏れで誰でも更新できる状態を作らない。D34 の7）
   */
  authorize?: MiddlewareHandler<AuthedEnv>;
  /** 今の時刻（テストで差し替える） */
  now?: () => number;
}

/**
 * 起動してから、GitHub の実行の一覧に新しい実行が出るまでの待ち時間の上限。
 * この間は、一覧のいちばん新しい実行（前回の、終わった実行）ではなく「更新中」を返す
 */
const PENDING_MS = 120_000;
/** GitHub と API の時計のずれの許容 */
const CLOCK_SKEW_MS = 30_000;

const denyAll: MiddlewareHandler<AuthedEnv> = async (c) =>
  c.json(errorBody('forbidden', 'この操作をする権限がありません'), 403);

function toStatus(run: MapDataRun | null): MapDataStatus {
  return { state: run ? run.state : 'idle', run };
}

/** /api/admin/map-data：管理者が地図データを更新する（D34） */
export function mapDataRoutes({ workflow, authorize = denyAll, now = Date.now }: MapDataDeps) {
  const routes = new Hono<AuthedEnv>();

  // 起動した直後の実行。一覧に出るまでは、これを「更新中」として返し、二重の起動も防ぐ。
  // API は1台で動かすので（D16）、メモリに覚えれば足りる
  let pending: { run: MapDataRun | null; since: number } | null = null;

  async function currentStatus(wf: MapDataWorkflow): Promise<MapDataStatus> {
    const latest = await wf.latestRun();
    if (pending) {
      // 起動した実行（ID が分かればその ID、分からなければ起動より後に始まった実行）が一覧に出たか
      const appeared =
        latest !== null &&
        (latest.id === pending.run?.id || Date.parse(latest.startedAt) >= pending.since - CLOCK_SKEW_MS);
      if (!appeared && now() - pending.since < PENDING_MS) return { state: 'running', run: pending.run };
      pending = null;
    }
    return toStatus(latest);
  }

  routes.use('*', authorize);

  routes.use('*', async (c, next) => {
    if (!workflow) {
      return c.json(errorBody('not_configured', '地図データの更新が設定されていません（GITHUB_MAP_DATA_TOKEN）'), 503);
    }
    await next();
  });

  // GitHub の失敗は 502 にする（ハンドラーで投げた例外は、前段のミドルウェアでは捕まえられないため、ここで包む）
  const withGitHub =
    (handler: (c: Context<AuthedEnv>, wf: MapDataWorkflow) => Promise<Response>) => async (c: Context<AuthedEnv>) => {
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

  routes.get('/status', withGitHub(async (c, wf) => c.json(await currentStatus(wf))));

  routes.post(
    '/refresh',
    withGitHub(async (c, wf) => {
      // JSON 以外の送信（CSRF）は、createApp の全体のミドルウェアが 415 にする（D33）
      const current = await currentStatus(wf);
      if (current.state === 'running') {
        return c.json(
          { ...errorBody('conflict', '地図データを更新中です。終わるまでお待ちください'), status: current },
          409,
        );
      }
      const started = await wf.dispatch();
      const since = now();
      const run: MapDataRun | null = started
        ? { id: started.id, state: 'running', startedAt: new Date(since).toISOString(), finishedAt: null, url: started.url }
        : null;
      pending = { run, since };
      const status: MapDataStatus = { state: 'running', run };
      return c.json(status, 202);
    }),
  );

  return routes;
}
