import { describe, expect, it } from 'vitest';
import { parseRange } from './range';
import { serveMapData } from './[[path]]';

describe('parseRange', () => {
  it('範囲の指定を読む', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=990-2000', 1000)).toEqual({ start: 990, end: 999 });
  });

  it('ヘッダーがない・読めない・複数の範囲は null（全体を返す）', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('items=0-1', 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
    expect(parseRange('bytes=0-1,5-9', 1000)).toBeNull();
  });

  it('ファイルの外は invalid', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('invalid');
    expect(parseRange('bytes=50-10', 1000)).toBe('invalid');
    expect(parseRange('bytes=-0', 1000)).toBe('invalid');
  });
});

/** R2Bucket のうち head と get(range) だけを持つ偽物 */
function fakeBucket(files: Record<string, Uint8Array>) {
  return {
    async head(key: string) {
      const f = files[key];
      return f ? { size: f.length, httpEtag: '"etag-1"' } : null;
    },
    async get(key: string, opts?: { range?: { offset: number; length: number } }) {
      const f = files[key];
      if (!f) return null;
      const { offset = 0, length = f.length } = opts?.range ?? {};
      return { body: f.slice(offset, offset + length) };
    },
  } as unknown as R2Bucket;
}

const data = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
const bucket = fakeBucket({ 'tokai.pmtiles': data, 'secret.txt': data });
const req = (range?: string) => new Request('https://example.com/map/tokai.pmtiles', range ? { headers: { Range: range } } : {});

describe('serveMapData', () => {
  it('Range があれば 206 で、その範囲だけ返す', async () => {
    const res = await serveMapData(req('bytes=10-19'), bucket, 'tokai.pmtiles');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(res.headers.get('ETag')).toBe('"etag-1"');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('Range がなければ 200 で全体を返す', async () => {
    const res = await serveMapData(req(), bucket, 'tokai.pmtiles');
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it('範囲の外は 416', async () => {
    const res = await serveMapData(req('bytes=100-'), bucket, 'tokai.pmtiles');
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */100');
  });

  it('.pmtiles 以外の名前・パスを含む名前・ないファイルは 404', async () => {
    expect((await serveMapData(req(), bucket, 'secret.txt')).status).toBe(404);
    expect((await serveMapData(req(), bucket, '../tokai.pmtiles')).status).toBe(404);
    expect((await serveMapData(req(), bucket, 'sub/tokai.pmtiles')).status).toBe(404);
    expect((await serveMapData(req(), bucket, 'kanto.pmtiles')).status).toBe(404);
  });

  it('バケットが設定されていなければ 503', async () => {
    expect((await serveMapData(req(), undefined, 'tokai.pmtiles')).status).toBe(503);
  });
});
