import type { ApiErrorBody, MapDataInfo, MapDataStatus } from '@yamon/shared';

/** 地図データの更新（D34）の API・Worker（/map/*）とのやりとり。失敗は画面に出す日本語のメッセージにして投げる */

export const MAP_DATA_INFO_URL = '/map/survey-area.json';
const STATUS_URL = '/api/admin/map-data/status';
const REFRESH_URL = '/api/admin/map-data/refresh';

export class MapDataApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** 409（更新中）のとき、API が返した今の状態 */
    readonly current?: MapDataStatus,
  ) {
    super(message);
    this.name = 'MapDataApiError';
  }
}

async function toError(res: Response): Promise<MapDataApiError> {
  const body = (await res.json().catch(() => null)) as (Partial<ApiErrorBody> & { status?: MapDataStatus }) | null;
  const fallback =
    res.status === 401
      ? 'ログインし直してください'
      : res.status === 403
        ? '地図データを更新する権限がありません'
        : '地図データの更新の状態を取得できませんでした';
  return new MapDataApiError(res.status, body?.error?.message ?? fallback, body?.status);
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: 'same-origin', ...init });
  } catch {
    throw new MapDataApiError(0, 'サーバーにつながりませんでした。通信状態を確かめてください');
  }
}

export async function fetchMapDataStatus(): Promise<MapDataStatus> {
  const res = await request(STATUS_URL);
  if (!res.ok) throw await toError(res);
  return (await res.json()) as MapDataStatus;
}

/** 更新を始める。更新中なら 409 の MapDataApiError（current に今の状態） */
export async function startMapDataRefresh(): Promise<MapDataStatus> {
  const res = await request(REFRESH_URL, {
    method: 'POST',
    // 状態を変える API は JSON に限る（CSRF 対策、#11）
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as MapDataStatus;
}

/** 今の地図データの情報。参照先がまだない（手作業で置いた最初のデータを使っている）ときは null */
export async function fetchMapDataInfo(): Promise<MapDataInfo | null> {
  const res = await request(MAP_DATA_INFO_URL, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new MapDataApiError(res.status, '今の地図データの情報を取得できませんでした');
  return (await res.json()) as MapDataInfo;
}

/** ビルド日（20261015）を 2026-10-15 にする */
export function formatBuildDate(build: string): string {
  return /^\d{8}$/.test(build) ? `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6)}` : build;
}
