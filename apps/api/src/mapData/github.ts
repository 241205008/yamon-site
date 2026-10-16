import type { MapDataRun } from '@yamon/shared';

/** 地図データの更新のワークフロー（.github/workflows/map-data.yml）を起動・確認する口（D34） */
export interface MapDataWorkflow {
  /** いちばん新しい実行。まだ一度もなければ null */
  latestRun(): Promise<MapDataRun | null>;
  /** 起動する。GitHub が実行の情報を返したときはそれを返す */
  dispatch(): Promise<{ id: number; url: string } | null>;
}

/** GitHub の API が失敗した（鍵の期限切れ・権限不足・GitHub の障害など）。API は 502 を返す */
export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

interface WorkflowRunResponse {
  id: number;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

/** GitHub の実行の状態を、画面に出す3つの状態に直す */
export function toMapDataRun(run: WorkflowRunResponse): MapDataRun {
  const finished = run.status === 'completed';
  return {
    id: run.id,
    state: !finished ? 'running' : run.conclusion === 'success' ? 'succeeded' : 'failed',
    startedAt: run.created_at,
    finishedAt: finished ? run.updated_at : null,
    url: run.html_url,
  };
}

export interface GitHubWorkflowOptions {
  /** このリポジトリの Actions だけを読み書きできる fine-grained personal access token */
  token: string;
  /** owner/repo */
  repository: string;
  workflow?: string;
  ref?: string;
  fetch?: typeof fetch;
}

export function createGitHubWorkflow({
  token,
  repository,
  workflow = 'map-data.yml',
  ref = 'main',
  fetch: fetchImpl = fetch,
}: GitHubWorkflowOptions): MapDataWorkflow {
  const base = `https://api.github.com/repos/${repository}/actions/workflows/${workflow}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'yamon-site-api',
  };

  async function call(url: string, init: RequestInit = {}) {
    const res = await fetchImpl(url, { ...init, headers: { ...headers, ...init.headers } });
    if (!res.ok) {
      // 応答の本文には鍵は含まれないが、ログには状態コードだけ残す
      throw new GitHubApiError(res.status, `GitHub の API が失敗しました（${res.status}）`);
    }
    return res;
  }

  return {
    async latestRun() {
      // 取り消された実行（2つ同時に起動され、concurrency で待ちの方が置き換えられたものなど）は失敗ではないので飛ばす
      const res = await call(`${base}/runs?per_page=10`);
      const body = (await res.json()) as { workflow_runs?: WorkflowRunResponse[] };
      const run = body.workflow_runs?.find((r) => r.conclusion !== 'cancelled');
      return run ? toMapDataRun(run) : null;
    },
    async dispatch() {
      const res = await call(`${base}/dispatches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // return_run_details：起動した実行の ID と URL を返してもらう（2026-02 から。返らなければ 204）
        body: JSON.stringify({ ref, return_run_details: true }),
      });
      if (res.status === 204) return null;
      const body = (await res.json()) as { workflow_run_id?: number; html_url?: string };
      return body.workflow_run_id && body.html_url ? { id: body.workflow_run_id, url: body.html_url } : null;
    },
  };
}
