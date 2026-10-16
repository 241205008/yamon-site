import type { MapDataRun } from '@yamon/shared';
import type { MiddlewareHandler } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { requirePermission, type AuthedEnv } from '../src/auth/middleware';
import { errorBody } from '../src/errors';
import { createGitHubWorkflow, GitHubApiError, type MapDataWorkflow } from '../src/mapData/github';
import { createUser, login, setupTestApp, type TestContext } from './helpers';

/** ワークフローの偽物。latest を書き換えて状態を作り、dispatch が呼ばれた回数を数える */
function fakeWorkflow() {
  const state = { latest: null as MapDataRun | null, dispatched: 0, fail: false };
  const workflow: MapDataWorkflow = {
    async latestRun() {
      if (state.fail) throw new GitHubApiError(401, 'GitHub の API が失敗しました（401）');
      return state.latest;
    },
    async dispatch() {
      state.dispatched++;
      return { id: 99, url: 'https://github.com/o/r/actions/runs/99' };
    },
  };
  return { state, workflow };
}

/** テスト用の権限チェック：x-test-role が admin なら通す（本番は #11 の requirePermission） */
const testAuthorize: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  const role = c.req.header('x-test-role');
  if (!role) return c.json(errorBody('unauthorized', 'ログインしてください'), 401);
  if (role !== 'admin') return c.json(errorBody('forbidden', '権限がありません'), 403);
  await next();
};

const run = (state: MapDataRun['state']): MapDataRun => ({
  id: 1,
  state,
  startedAt: '2026-10-16T00:00:00Z',
  finishedAt: state === 'running' ? null : '2026-10-16T00:05:00Z',
  url: 'https://github.com/o/r/actions/runs/1',
});

const admin = { 'x-test-role': 'admin' };
const json = { 'Content-Type': 'application/json' };

describe('/api/admin/map-data（権限チェックとワークフローあり）', () => {
  let ctx: TestContext;
  const fake = fakeWorkflow();
  beforeAll(async () => {
    ctx = await setupTestApp({ mapData: { workflow: fake.workflow, authorize: testAuthorize } });
  });
  afterAll(() => ctx.close());
  beforeEach(() => {
    fake.state.latest = null;
    fake.state.dispatched = 0;
    fake.state.fail = false;
  });

  it('未ログインは 401、管理者以外は 403。どちらも起動しない', async () => {
    expect((await ctx.app.request('/api/admin/map-data/status')).status).toBe(401);
    const res = await ctx.app.request('/api/admin/map-data/refresh', {
      method: 'POST',
      headers: { 'x-test-role': 'member', ...json },
      body: '{}',
    });
    expect(res.status).toBe(403);
    expect(fake.state.dispatched).toBe(0);
  });

  it('一度も実行していなければ idle', async () => {
    const res = await ctx.app.request('/api/admin/map-data/status', { headers: admin });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'idle', run: null });
  });

  it('最新の実行の状態を返す', async () => {
    fake.state.latest = run('failed');
    const res = await ctx.app.request('/api/admin/map-data/status', { headers: admin });
    expect(await res.json()).toEqual({ state: 'failed', run: run('failed') });
  });

  it('管理者が押すと起動し、202 と実行中の状態を返す', async () => {
    fake.state.latest = run('succeeded');
    const res = await ctx.app.request('/api/admin/map-data/refresh', { method: 'POST', headers: { ...admin, ...json }, body: '{}' });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ state: 'running', run: { id: 99, state: 'running', finishedAt: null } });
    expect(fake.state.dispatched).toBe(1);
  });

  it('実行中なら 409 で、二重に起動しない', async () => {
    fake.state.latest = run('running');
    const res = await ctx.app.request('/api/admin/map-data/refresh', { method: 'POST', headers: { ...admin, ...json }, body: '{}' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'conflict' }, status: { state: 'running' } });
    expect(fake.state.dispatched).toBe(0);
  });

  it('JSON 以外で送られたら 415 で起動しない（CSRF 対策、全体のミドルウェア）', async () => {
    const res = await ctx.app.request('/api/admin/map-data/refresh', {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'a=1',
    });
    expect(res.status).toBe(415);
    expect(fake.state.dispatched).toBe(0);
  });

  it('GitHub の API が失敗したら 502 で、鍵などの中身は返さない', async () => {
    fake.state.fail = true;
    const res = await ctx.app.request('/api/admin/map-data/status', { headers: admin });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('github_error');
    expect(JSON.stringify(body)).not.toContain('401');
  });
});

describe('/api/admin/map-data（設定が足りないとき）', () => {
  let noAuth: TestContext;
  let noWorkflow: TestContext;
  beforeAll(async () => {
    noAuth = await setupTestApp({ mapData: { workflow: fakeWorkflow().workflow } });
    noWorkflow = await setupTestApp({ mapData: { authorize: testAuthorize } });
  });
  afterAll(async () => {
    await noAuth.close();
    await noWorkflow.close();
  });

  it('権限チェックが渡されていなければ、誰でも 403（仮の実装で通さない）', async () => {
    const res = await noAuth.app.request('/api/admin/map-data/refresh', { method: 'POST', headers: { ...admin, ...json }, body: '{}' });
    expect(res.status).toBe(403);
  });

  it('GitHub の鍵がなければ 503', async () => {
    const res = await noWorkflow.app.request('/api/admin/map-data/status', { headers: admin });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_configured');
  });
});

describe('createGitHubWorkflow', () => {
  /** fetch の偽物。呼ばれた URL・方法・本文を記録し、決めた応答を返す */
  function fakeFetch(response: () => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return response();
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it('最新の実行を、画面に出す状態に直して返す', async () => {
    const f = fakeFetch(() =>
      Response.json({
        workflow_runs: [
          { id: 5, status: 'completed', conclusion: 'failure', created_at: 'a', updated_at: 'b', html_url: 'u' },
        ],
      }),
    );
    const wf = createGitHubWorkflow({ token: 'tkn', repository: 'o/r', fetch: f.impl });
    expect(await wf.latestRun()).toEqual({ id: 5, state: 'failed', startedAt: 'a', finishedAt: 'b', url: 'u' });
    expect(f.calls[0].url).toBe('https://api.github.com/repos/o/r/actions/workflows/map-data.yml/runs?per_page=10');
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tkn');
  });

  it('取り消された実行は飛ばし、その前の実行を返す', async () => {
    const f = fakeFetch(() =>
      Response.json({
        workflow_runs: [
          { id: 9, status: 'completed', conclusion: 'cancelled', created_at: 'c', updated_at: 'd', html_url: 'u9' },
          { id: 8, status: 'completed', conclusion: 'success', created_at: 'a', updated_at: 'b', html_url: 'u8' },
        ],
      }),
    );
    const wf = createGitHubWorkflow({ token: 't', repository: 'o/r', fetch: f.impl });
    expect(await wf.latestRun()).toMatchObject({ id: 8, state: 'succeeded' });
  });

  it('実行中・成功の状態を直す。一度もなければ null', async () => {
    const one = (status: string, conclusion: string | null) =>
      createGitHubWorkflow({
        token: 't',
        repository: 'o/r',
        fetch: fakeFetch(() =>
          Response.json({ workflow_runs: [{ id: 1, status, conclusion, created_at: 'a', updated_at: 'b', html_url: 'u' }] }),
        ).impl,
      }).latestRun();
    expect((await one('queued', null))?.state).toBe('running');
    expect((await one('in_progress', null))?.finishedAt).toBeNull();
    expect((await one('completed', 'success'))?.state).toBe('succeeded');
    const none = createGitHubWorkflow({ token: 't', repository: 'o/r', fetch: fakeFetch(() => Response.json({ workflow_runs: [] })).impl });
    expect(await none.latestRun()).toBeNull();
  });

  it('起動は main を指定し、返ってきた実行の ID と URL を返す。204 なら null', async () => {
    const f = fakeFetch(() => Response.json({ workflow_run_id: 7, run_url: 'api', html_url: 'web' }));
    const wf = createGitHubWorkflow({ token: 't', repository: 'o/r', fetch: f.impl });
    expect(await wf.dispatch()).toEqual({ id: 7, url: 'web' });
    expect(f.calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ ref: 'main', return_run_details: true });

    const g = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await createGitHubWorkflow({ token: 't', repository: 'o/r', fetch: g.impl }).dispatch()).toBeNull();
  });

  it('GitHub が失敗を返したら GitHubApiError', async () => {
    const f = fakeFetch(() => new Response('Bad credentials', { status: 401 }));
    await expect(createGitHubWorkflow({ token: 't', repository: 'o/r', fetch: f.impl }).latestRun()).rejects.toBeInstanceOf(
      GitHubApiError,
    );
  });
});

describe('/api/admin/map-data（#11 の requirePermission と Cookie のログイン）', () => {
  let ctx: TestContext;
  const fake = fakeWorkflow();
  beforeAll(async () => {
    ctx = await setupTestApp({
      cookieSecure: false,
      mapData: { workflow: fake.workflow, authorize: requirePermission('mapData.update') },
    });
  });
  afterAll(() => ctx.close());

  it('管理者は状態を見て起動でき、幹部・部員は 403、未ログインは 401', async () => {
    const admin = await createUser(ctx.db, { role: 'admin' });
    const officer = await createUser(ctx.db, { role: 'officer' });
    const adminCookie = await login(ctx, admin.email, admin.password);
    const officerCookie = await login(ctx, officer.email, officer.password);

    expect((await ctx.app.request('/api/admin/map-data/status')).status).toBe(401);
    expect((await ctx.app.request('/api/admin/map-data/status', { headers: { Cookie: officerCookie } })).status).toBe(403);
    expect((await ctx.app.request('/api/admin/map-data/status', { headers: { Cookie: adminCookie } })).status).toBe(200);

    const denied = await ctx.app.request('/api/admin/map-data/refresh', {
      method: 'POST',
      headers: { Cookie: officerCookie, ...json },
      body: '{}',
    });
    expect(denied.status).toBe(403);
    expect(fake.state.dispatched).toBe(0);

    const res = await ctx.app.request('/api/admin/map-data/refresh', {
      method: 'POST',
      headers: { Cookie: adminCookie, ...json },
      body: '{}',
    });
    expect(res.status).toBe(202);
    expect(fake.state.dispatched).toBe(1);
  });
});

describe('/api/admin/map-data（起動した直後、一覧に新しい実行が出るまで）', () => {
  let ctx: TestContext;
  const fake = fakeWorkflow();
  let nowMs = Date.parse('2026-10-16T01:00:00Z');
  beforeAll(async () => {
    ctx = await setupTestApp({ mapData: { workflow: fake.workflow, authorize: testAuthorize, now: () => nowMs } });
  });
  afterAll(() => ctx.close());

  const status = async () =>
    (await (await ctx.app.request('/api/admin/map-data/status', { headers: admin })).json()) as { state: string };
  const refresh = () =>
    ctx.app.request('/api/admin/map-data/refresh', { method: 'POST', headers: { ...admin, ...json }, body: '{}' });

  it('一覧が前回の実行のままでも「更新中」を返し、二重に起動しない。出たらその状態を返す', async () => {
    fake.state.latest = run('succeeded'); // 前回の実行（00:00 開始）
    expect((await refresh()).status).toBe(202);
    expect(await status()).toMatchObject({ state: 'running', run: { id: 99 } });
    expect((await refresh()).status).toBe(409);
    expect(fake.state.dispatched).toBe(1);

    // 起動した実行（id 99）が一覧に出て、終わった
    fake.state.latest = { ...run('succeeded'), id: 99, startedAt: '2026-10-16T01:00:05Z' };
    expect(await status()).toMatchObject({ state: 'succeeded', run: { id: 99 } });
  });

  it('一覧に出ないまま2分たったら、一覧の状態に戻す（起動に失敗したときに止まらない）', async () => {
    nowMs = Date.parse('2026-10-16T02:00:00Z');
    fake.state.latest = run('succeeded');
    expect((await refresh()).status).toBe(202);
    expect((await status()).state).toBe('running');
    nowMs += 121_000;
    expect((await status()).state).toBe('succeeded');
  });
});
