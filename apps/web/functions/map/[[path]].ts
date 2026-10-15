import { parseRange } from './range';

interface Env {
  /** 地図データを置いた R2 バケット。Pages のプロジェクト設定でバインドする（docs/MAP_DATA.md） */
  MAP_DATA?: R2Bucket;
}

/** 返してよいファイル名。バケットの中のほかのオブジェクトは返さない */
const NAME_PATTERN = /^[a-z0-9-]+\.pmtiles$/;

/**
 * GET /map/<名前>.pmtiles：R2 の地図データを Range 付きで返す（D28）。
 * 独自ドメインがなく R2 を直接公開できないため、Pages Functions を通す
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '');
  return serveMapData(request, env.MAP_DATA, path);
};

export async function serveMapData(
  request: Request,
  bucket: R2Bucket | undefined,
  name: string,
): Promise<Response> {
  if (!NAME_PATTERN.test(name)) return new Response('Not Found', { status: 404 });
  if (!bucket) return new Response('地図データの保存先（MAP_DATA）が設定されていません', { status: 503 });

  const head = await bucket.head(name);
  if (!head) return new Response('Not Found', { status: 404 });

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': 'application/octet-stream',
    // 地図データは年1回程度しか変えない。差し替えたときは ETag が変わり、PMTiles の読み込み側が気づく
    'Cache-Control': 'public, max-age=86400',
    ETag: head.httpEtag,
  });

  const range = parseRange(request.headers.get('Range'), head.size);
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }

  const { start, end } = range ?? { start: 0, end: head.size - 1 };
  const object = await bucket.get(name, { range: { offset: start, length: end - start + 1 } });
  if (!object) return new Response('Not Found', { status: 404 });

  if (!range) return new Response(object.body, { status: 200, headers });
  headers.set('Content-Range', `bytes ${start}-${end}/${head.size}`);
  return new Response(object.body, { status: 206, headers });
}
