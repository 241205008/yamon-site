import { ExternalLink, Map as MapIcon, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isoToJstDateTime, MAP_DATA_STATE_LABELS, type MapDataInfo, type MapDataStatus } from '@yamon/shared';
import {
  fetchMapDataInfo,
  fetchMapDataStatus,
  formatBuildDate,
  MapDataApiError,
  startMapDataRefresh,
} from '../lib/mapDataApi';
import { Card, ErrorText } from './ui';

/** 更新中に状態を読み直す間隔 */
const POLL_MS = 15_000;

const STATE_STYLES: Record<MapDataStatus['state'], string> = {
  idle: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-800',
  succeeded: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const toMessage = (e: unknown) => (e instanceof MapDataApiError ? e.message : '処理に失敗しました');

/**
 * 管理者画面の「地図データ」：今の地図データのビルド日と、更新ボタン・更新の状態（D33）。
 * 更新は GitHub Actions で数分かかる。その間も今の地図は表示され続ける
 */
export function MapDataPanel() {
  const [info, setInfo] = useState<MapDataInfo | null | undefined>(undefined);
  const [status, setStatus] = useState<MapDataStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const loadInfo = useCallback(async () => {
    try {
      setInfo(await fetchMapDataInfo());
    } catch {
      setInfo(null);
    }
  }, []);

  const lastState = useRef<MapDataStatus['state'] | null>(null);
  const loadStatus = useCallback(async () => {
    try {
      const next = await fetchMapDataStatus();
      // 更新中から終わったら、今の地図データの情報も読み直す
      if (lastState.current === 'running' && next.state !== 'running') void loadInfo();
      lastState.current = next.state;
      setStatus(next);
      setError(null);
    } catch (e) {
      setError(toMessage(e));
    }
  }, [loadInfo]);

  useEffect(() => {
    void loadInfo();
    void loadStatus();
  }, [loadInfo, loadStatus]);

  const running = status?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => void loadStatus(), POLL_MS);
    return () => window.clearInterval(id);
  }, [running, loadStatus]);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const next = await startMapDataRefresh();
      lastState.current = next.state;
      setStatus(next);
    } catch (e) {
      if (e instanceof MapDataApiError && e.current) {
        lastState.current = e.current.state;
        setStatus(e.current);
      }
      setError(toMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const run = status?.run ?? null;

  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
        <MapIcon className="h-5 w-5 text-green-600" />
        地図データ
      </h2>
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">今のデータ</dt>
        <dd className="text-gray-800">
          {info === undefined
            ? '読み込み中…'
            : info
              ? `${formatBuildDate(info.build)} 時点の OpenStreetMap（${isoToJstDateTime(info.updatedAt)} に更新）`
              : '最初に置いたデータ（ボタンで更新した記録はありません）'}
        </dd>
        <dt className="text-gray-500">更新の状態</dt>
        <dd className="flex flex-wrap items-center gap-2 text-gray-800">
          {status ? (
            <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLES[status.state]}`}>
              {MAP_DATA_STATE_LABELS[status.state]}
            </span>
          ) : (
            <span className="text-gray-500">—</span>
          )}
          {run && <span className="text-gray-600">{isoToJstDateTime(run.startedAt)} 開始</span>}
          {run && (
            <a
              href={run.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
            >
              記録を見る
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </dd>
      </dl>
      {status?.state === 'failed' && (
        <p className="mb-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
          前回の更新は失敗しました。地図は前のデータのまま表示されています。もう一度更新するか、「記録を見る」から理由を確かめてください。
        </p>
      )}
      <div className="mb-3">
        <ErrorText message={error} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={starting || running || !status}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
          {running ? '更新中…' : '地図データを更新'}
        </button>
        <p className="text-sm text-gray-600">
          OpenStreetMap の最新のデータから4県を切り出し直します（数分かかります）。更新中も、終わるまでは今の地図が表示されます。
        </p>
      </div>
    </Card>
  );
}
