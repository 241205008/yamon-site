import { beforeEach, describe, expect, it } from 'vitest';
import { parseRange } from './range';
import { clearMapMetaCacheForTest, serveMapData, servePointer } from './[[path]]';

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

/** R2Bucket のうち head と get(range, onlyIf.etagMatches) だけを持つ偽物。calls で呼ばれた回数を数える */
function fakeBucket(files: Record<string, Uint8Array>) {
  const etags: Record<string, string> = {};
  const calls = { head: 0, get: 0 };
  const etagOf = (key: string) => etags[key] ?? 'v1';
  const bucket = {
    async head(key: string) {
      calls.head++;
      const f = files[key];
      return f ? { size: f.length, etag: etagOf(key), httpEtag: `"${etagOf(key)}"` } : null;
    },
    async get(key: string, opts?: { range?: { offset: number; length: number }; onlyIf?: { etagMatches?: string } }) {
      calls.get++;
      const f = files[key];
      if (!f) return null;
      if (opts?.onlyIf?.etagMatches && opts.onlyIf.etagMatches !== etagOf(key)) return { size: f.length };
      const { offset = 0, length = f.length } = opts?.range ?? {};
      const body = f.slice(offset, offset + length);
      return { body, json: async () => JSON.parse(new TextDecoder().decode(body)) };
    },
  } as unknown as R2Bucket;
  /** ファイルを差し替える */
  const replace = (key: string, data: Uint8Array, etag: string) => {
    files[key] = data;
    etags[key] = etag;
  };
  /** 参照先（<名前>.json）を書く */
  const point = (pointerName: string, value: unknown) => {
    files[pointerName] = new TextEncoder().encode(JSON.stringify(value));
  };
  const remove = (key: string) => {
    delete files[key];
  };
  return { bucket, calls, replace, point, remove };
}

const data = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
let fake: ReturnType<typeof fakeBucket>;
let bucket: R2Bucket;
beforeEach(() => {
  clearMapMetaCacheForTest();
  fake = fakeBucket({ 'survey-area.pmtiles': data, 'secret.txt': data });
  bucket = fake.bucket;
});
const req = (range?: string) => new Request('https://example.com/map/survey-area.pmtiles', range ? { headers: { Range: range } } : {});

describe('serveMapData', () => {
  it('Range があれば 206 で、その範囲だけ返す', async () => {
    const res = await serveMapData(req('bytes=10-19'), bucket, 'survey-area.pmtiles');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(res.headers.get('ETag')).toBe(`"v1"`);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('Range がなければ 200 で全体を返す', async () => {
    const res = await serveMapData(req(), bucket, 'survey-area.pmtiles');
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it('範囲の外は 416', async () => {
    const res = await serveMapData(req('bytes=100-'), bucket, 'survey-area.pmtiles');
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */100');
  });

  it('2回目からは参照先も head も読まず、R2 の読み出しは1回で済む', async () => {
    await serveMapData(req('bytes=0-9'), bucket, 'survey-area.pmtiles');
    await serveMapData(req('bytes=10-19'), bucket, 'survey-area.pmtiles');
    // 1回目：参照先の get・head・範囲の get。2回目：範囲の get だけ
    expect(fake.calls).toEqual({ head: 1, get: 3 });
  });

  it('差し替えられたら、新しいファイルの大きさ・ETag・中身で返す（古い大きさと新しい中身を混ぜない）', async () => {
    await serveMapData(req('bytes=0-9'), bucket, 'survey-area.pmtiles');
    fake.replace('survey-area.pmtiles', new Uint8Array(50).fill(7), 'v2');
    const res = await serveMapData(req('bytes=40-'), bucket, 'survey-area.pmtiles');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 40-49/50');
    expect(res.headers.get('ETag')).toBe(`"v2"`);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(Array(10).fill(7));
  });

  it('.pmtiles 以外の名前・パスを含む名前・ないファイルは 404', async () => {
    expect((await serveMapData(req(), bucket, 'secret.txt')).status).toBe(404);
    expect((await serveMapData(req(), bucket, '../survey-area.pmtiles')).status).toBe(404);
    expect((await serveMapData(req(), bucket, 'sub/survey-area.pmtiles')).status).toBe(404);
    expect((await serveMapData(req(), bucket, 'kanto.pmtiles')).status).toBe(404);
  });

  it('バケットが設定されていなければ 503', async () => {
    expect((await serveMapData(req(), undefined, 'survey-area.pmtiles')).status).toBe(503);
  });
});

const pointer = (key: string) => ({
  key,
  build: key.match(/\d{8}/)?.[0] ?? '',
  size: 0,
  maxzoom: 15,
  bounds: [135.7, 33.65, 137.95, 36.55],
  updatedAt: '2026-10-16T00:00:00Z',
});

describe('参照先（survey-area.json）による切り替え（D34）', () => {
  it('参照先があれば、そこに書かれた日付付きのファイルを返す', async () => {
    fake.replace('survey-area-20261015.pmtiles', new Uint8Array(30).fill(5), 'v15');
    fake.point('survey-area.json', pointer('survey-area-20261015.pmtiles'));
    const res = await serveMapData(req('bytes=0-'), bucket, 'survey-area.pmtiles');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-29/30');
    expect(res.headers.get('ETag')).toBe('"v15"');
  });

  it('参照先が切り替わり、前のファイルが消えても、読み直して新しいファイルを返す', async () => {
    fake.replace('survey-area-20261015.pmtiles', new Uint8Array(30).fill(5), 'v15');
    fake.point('survey-area.json', pointer('survey-area-20261015.pmtiles'));
    await serveMapData(req('bytes=0-9'), bucket, 'survey-area.pmtiles');

    fake.replace('survey-area-20261016.pmtiles', new Uint8Array(40).fill(6), 'v16');
    fake.point('survey-area.json', pointer('survey-area-20261016.pmtiles'));
    fake.remove('survey-area-20261015.pmtiles');
    const res = await serveMapData(req('bytes=0-'), bucket, 'survey-area.pmtiles');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-39/40');
    expect(res.headers.get('ETag')).toBe('"v16"');
  });

  it('参照先が壊れている・ほかのオブジェクトを指すときは、名前そのもののファイルを返す', async () => {
    fake.point('survey-area.json', { key: 'secret.txt' });
    const res = await serveMapData(req('bytes=0-'), bucket, 'survey-area.pmtiles');
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/100');

    clearMapMetaCacheForTest();
    fake.replace('survey-area.json', new TextEncoder().encode('{壊れた'), 'x');
    const res2 = await serveMapData(req('bytes=0-'), bucket, 'survey-area.pmtiles');
    expect(res2.headers.get('Content-Range')).toBe('bytes 0-99/100');
  });

  it('GET /map/survey-area.json は今の地図データの情報を返し、なければ 404', async () => {
    expect((await servePointer(bucket, 'survey-area.json')).status).toBe(404);
    fake.point('survey-area.json', pointer('survey-area-20261015.pmtiles'));
    const res = await servePointer(bucket, 'survey-area.json');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ key: 'survey-area-20261015.pmtiles', build: '20261015' });
    expect((await servePointer(bucket, '../secret.json')).status).toBe(404);
    expect((await servePointer(undefined, 'survey-area.json')).status).toBe(503);
  });
});
