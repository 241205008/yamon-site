import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMapDataInfo,
  fetchMapDataStatus,
  formatBuildDate,
  MapDataApiError,
  startMapDataRefresh,
} from './mapDataApi';

/** fetch を、決めた応答を返す偽物に差し替え、呼ばれた URL と設定を記録する */
function stubFetch(response: () => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response();
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchMapDataStatus', () => {
  it('状態を返す', async () => {
    stubFetch(() => Response.json({ state: 'idle', run: null }));
    await expect(fetchMapDataStatus()).resolves.toEqual({ state: 'idle', run: null });
  });

  it('API のエラーメッセージをそのまま使う', async () => {
    stubFetch(() => Response.json({ error: { code: 'not_configured', message: '設定されていません' } }, { status: 503 }));
    await expect(fetchMapDataStatus()).rejects.toThrow('設定されていません');
  });

  it('本文がないエラーは、状態コードに合わせた文言にする', async () => {
    stubFetch(() => new Response('', { status: 403 }));
    await expect(fetchMapDataStatus()).rejects.toThrow('権限がありません');
  });

  it('つながらないときは通信の確認を促す', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(fetchMapDataStatus()).rejects.toThrow('サーバーにつながりませんでした');
  });
});

describe('startMapDataRefresh', () => {
  it('JSON で POST する（CSRF 対策）', async () => {
    const calls = stubFetch(() => Response.json({ state: 'running', run: null }, { status: 202 }));
    await expect(startMapDataRefresh()).resolves.toEqual({ state: 'running', run: null });
    expect(calls[0].url).toBe('/api/admin/map-data/refresh');
    expect(calls[0].init?.method).toBe('POST');
    expect((calls[0].init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(calls[0].init?.body).toBe('{}');
  });

  it('更新中（409）なら、今の状態を持ったエラーにする', async () => {
    const current = { state: 'running', run: null };
    stubFetch(() =>
      Response.json({ error: { code: 'conflict', message: '地図データを更新中です' }, status: current }, { status: 409 }),
    );
    const err = await startMapDataRefresh().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MapDataApiError);
    expect((err as MapDataApiError).status).toBe(409);
    expect((err as MapDataApiError).current).toEqual(current);
  });
});

describe('fetchMapDataInfo', () => {
  it('参照先がなければ null（手作業で置いた最初のデータ）', async () => {
    stubFetch(() => new Response('', { status: 404 }));
    await expect(fetchMapDataInfo()).resolves.toBeNull();
  });

  it('情報を返す', async () => {
    stubFetch(() => Response.json({ key: 'survey-area-20261015.pmtiles', build: '20261015' }));
    await expect(fetchMapDataInfo()).resolves.toMatchObject({ build: '20261015' });
  });
});

describe('formatBuildDate', () => {
  it('8桁の日付を読みやすくする', () => {
    expect(formatBuildDate('20261015')).toBe('2026-10-15');
    expect(formatBuildDate('不明')).toBe('不明');
  });
});
