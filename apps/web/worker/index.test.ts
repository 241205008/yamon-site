import { describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

/** 静的アセットの偽物。呼ばれたパスを記録し、どのパスにも同じ内容を返す */
function fakeEnv(bucket?: Partial<R2Bucket>) {
  const assetPaths: string[] = [];
  const env = {
    ASSETS: {
      fetch: vi.fn(async (input: Request | string) => {
        assetPaths.push(new URL(typeof input === 'string' ? input : input.url).pathname);
        return new Response('asset');
      }),
    },
    MAP_DATA: bucket,
  } as unknown as Env;
  return { env, assetPaths };
}

const call = (env: Env, path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://example.com${path}`, init) as Request<unknown, IncomingRequestCfProperties>, env);

describe('Worker の入口', () => {
  it('/map/*.pmtiles は地図配信につなぐ（R2 がなければ 503）', async () => {
    const { env, assetPaths } = fakeEnv();
    const res = await call(env, '/map/survey-area.pmtiles');
    expect(res.status).toBe(503);
    expect(assetPaths).toEqual([]);
  });

  it('/map/*.json は参照先の情報につなぐ', async () => {
    const pointer = { key: 'survey-area-20261016-1.pmtiles', build: '20261016', size: 1, maxzoom: 15, bounds: [], updatedAt: '' };
    const { env } = fakeEnv({ get: vi.fn(async () => ({ json: async () => pointer })) } as unknown as R2Bucket);
    const res = await call(env, '/map/survey-area.json');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pointer);
  });

  it('/map/ の下でも、決めた形でない名前は 404', async () => {
    const { env, assetPaths } = fakeEnv();
    expect((await call(env, '/map/sub/survey-area.pmtiles')).status).toBe(404);
    expect((await call(env, '/map/other.txt')).status).toBe(404);
    expect((await call(env, '/map/%2e%2e%2fsecret.pmtiles')).status).toBe(404);
    expect(assetPaths).toEqual([]);
  });

  it('/map/ は GET 以外を受け付けない', async () => {
    const { env } = fakeEnv();
    const res = await call(env, '/map/survey-area.pmtiles', { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('それ以外のパスは静的アセットを返す', async () => {
    const { env, assetPaths } = fakeEnv();
    const res = await call(env, '/event-detail/abc');
    expect(await res.text()).toBe('asset');
    expect(assetPaths).toEqual(['/event-detail/abc']);
  });
});
