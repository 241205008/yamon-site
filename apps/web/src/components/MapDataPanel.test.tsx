import type { MapDataStatus } from '@yamon/shared';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapDataPanel } from './MapDataPanel';

// React の act() を使うテストであることを知らせる
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const run = (state: 'running' | 'succeeded' | 'failed', id = 1) => ({
  id,
  state,
  startedAt: '2026-10-16T03:00:00Z',
  finishedAt: state === 'running' ? null : '2026-10-16T03:05:00Z',
  url: 'https://github.com/o/r/actions/runs/1',
});

/** API と Functions の偽物。status・info を書き換えて状態を作り、呼ばれた回数を数える */
const server = {
  status: { state: 'idle', run: null } as MapDataStatus,
  info: { status: 404, body: null as unknown },
  calls: { status: 0, info: 0, refresh: 0 },
};

function stubFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.startsWith('/api/admin/map-data/status')) {
      server.calls.status++;
      return Response.json(server.status);
    }
    if (url.startsWith('/api/admin/map-data/refresh')) {
      server.calls.refresh++;
      server.status = { state: 'running', run: run('running', 2) };
      return Response.json(server.status, { status: 202 });
    }
    if (url.startsWith('/map/survey-area.json')) {
      server.calls.info++;
      return server.info.body ? Response.json(server.info.body, { status: server.info.status }) : new Response('', { status: server.info.status });
    }
    throw new Error(`想定外の URL: ${url}`);
  });
}

/** 非同期の処理（fetch → setState）を流し切る */
async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

let container: HTMLDivElement;
let root: Root;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MapDataPanel />));
  await flush();
}

const button = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('地図データを更新') || b.textContent?.includes('更新中'))!;

beforeEach(() => {
  server.status = { state: 'idle', run: null };
  server.info = { status: 404, body: null };
  server.calls = { status: 0, info: 0, refresh: 0 };
  stubFetch();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MapDataPanel', () => {
  it('前回が失敗なら知らせ、押すと更新中になってボタンが押せなくなる', async () => {
    server.status = { state: 'failed', run: run('failed') };
    await render();
    expect(container.textContent).toContain('前回の更新は失敗しました');
    expect(button().disabled).toBe(false);

    await act(async () => button().click());
    await flush();
    expect(server.calls.refresh).toBe(1);
    expect(container.textContent).toContain('更新中');
    expect(button().disabled).toBe(true);
  });

  it('更新中は15秒ごとに状態を読み直し、終わったら今のデータの情報も読み直す', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    server.status = { state: 'running', run: run('running') };
    await render();
    const infoCalls = server.calls.info;

    server.status = { state: 'succeeded', run: run('succeeded') };
    server.info = {
      status: 200,
      body: { key: 'survey-area-20261016-1.pmtiles', build: '20261016', size: 1, maxzoom: 15, bounds: [], updatedAt: '2026-10-16T03:05:00Z' },
    };
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await flush();
    expect(container.textContent).toContain('完了');
    expect(container.textContent).toContain('2026-10-16 時点の OpenStreetMap');
    expect(server.calls.info).toBe(infoCalls + 1);
    expect(button().disabled).toBe(false);
  });

  it('参照先がなければ「最初に置いたデータ」、取得に失敗したら「取得できませんでした」', async () => {
    await render();
    expect(container.textContent).toContain('最初に置いたデータ');
    act(() => root.unmount());
    container.remove();

    server.info = { status: 503, body: null };
    await render();
    expect(container.textContent).toContain('取得できませんでした');
  });

  it('API が使えないとき（権限なし・未設定）は理由を出し、ボタンは押せない', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.startsWith('/api/')
        ? Response.json({ error: { code: 'forbidden', message: 'この操作をする権限がありません' } }, { status: 403 })
        : new Response('', { status: 404 }),
    );
    await render();
    expect(container.textContent).toContain('この操作をする権限がありません');
    expect(button().disabled).toBe(true);
  });
});
