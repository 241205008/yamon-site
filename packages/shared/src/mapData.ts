/** 地図データの更新（D34）の状態。API が返し、管理者画面が表示する */
export const MAP_DATA_STATES = ['idle', 'running', 'succeeded', 'failed'] as const;
export type MapDataState = (typeof MAP_DATA_STATES)[number];

export const MAP_DATA_STATE_LABELS: Record<MapDataState, string> = {
  idle: 'まだ更新していません',
  running: '更新中',
  succeeded: '完了',
  failed: '失敗',
};

/** GitHub Actions の1回の実行 */
export interface MapDataRun {
  id: number;
  state: Exclude<MapDataState, 'idle'>;
  startedAt: string;
  /** 終わっていなければ null */
  finishedAt: string | null;
  /** Actions の実行画面（失敗の理由はここのログで見る） */
  url: string;
}

/** GET /api/admin/map-data/status の応答 */
export interface MapDataStatus {
  state: MapDataState;
  /** いちばん新しい実行。まだ一度も実行していなければ null */
  run: MapDataRun | null;
}

/** /map/<名前>.json（今の地図データの情報。Pages Functions が返す） */
export interface MapDataInfo {
  key: string;
  build: string;
  size: number;
  maxzoom: number;
  bounds: number[];
  updatedAt: string;
}
