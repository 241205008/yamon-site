import { parseRange } from './range';

interface Env {
  /** 地図データを置いた R2 バケット。Pages のプロジェクト設定でバインドする（docs/MAP_DATA.md） */
  MAP_DATA?: R2Bucket;
}

/** 返してよいファイル名。バケットの中のほかのオブジェクトは返さない */
const NAME_PATTERN = /^[a-z0-9-]+\.pmtiles$/;

/** ファイルの大きさと ETag を覚えておく時間。タイルごとに head を呼ばずに済ませる */
const META_TTL_MS = 60_000;
const metaCache = new Map<string, { size: number; etag: string; httpEtag: string; at: number }>();

/**
 * GET /map/<名前>.pmtiles：R2 の地図データを Range 付きで返す（D28）。
 * 独自ドメインがなく R2 を直接公開できないため、Pages Functions を通す
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '');
  return serveMapData(request, env.MAP_DATA, path);
};

async function loadMeta(bucket: R2Bucket, name: string, refresh: boolean) {
  const cached = metaCache.get(name);
  if (!refresh && cached && Date.now() - cached.at < META_TTL_MS) return cached;
  const head = await bucket.head(name);
  if (!head) {
    metaCache.delete(name);
    return null;
  }
  const meta = { size: head.size, etag: head.etag, httpEtag: head.httpEtag, at: Date.now() };
  metaCache.set(name, meta);
  return meta;
}

export async function serveMapData(
  request: Request,
  bucket: R2Bucket | undefined,
  name: string,
): Promise<Response> {
  if (!NAME_PATTERN.test(name)) return new Response('Not Found', { status: 404 });
  if (!bucket) return new Response('地図データの保存先（MAP_DATA）が設定されていません', { status: 503 });

  // 覚えている ETag と同じときだけ読む。差し替えられていたら（onlyIf が外れたら）、大きさを読み直して1回だけやり直す
  for (const refresh of [false, true]) {
    const meta = await loadMeta(bucket, name, refresh);
    if (!meta) return new Response('Not Found', { status: 404 });

    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      // 差し替えたときにすぐ気づけるよう、ブラウザには毎回 ETag で確かめさせる
      'Cache-Control': 'no-cache',
      ETag: meta.httpEtag,
    });

    const range = parseRange(request.headers.get('Range'), meta.size);
    if (range === 'invalid') {
      headers.set('Content-Range', `bytes */${meta.size}`);
      return new Response(null, { status: 416, headers });
    }

    const { start, end } = range ?? { start: 0, end: meta.size - 1 };
    const object = await bucket.get(name, {
      range: { offset: start, length: end - start + 1 },
      onlyIf: { etagMatches: meta.etag },
    });
    if (!object) {
      metaCache.delete(name);
      return new Response('Not Found', { status: 404 });
    }
    if (!('body' in object)) continue;

    if (!range) return new Response(object.body, { status: 200, headers });
    headers.set('Content-Range', `bytes ${start}-${end}/${meta.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response('地図データが更新中です。再読み込みしてください', { status: 503 });
}

/** テスト用：覚えている大きさと ETag を消す */
export function clearMapMetaCacheForTest() {
  metaCache.clear();
}
