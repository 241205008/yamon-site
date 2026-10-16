// CI のデプロイは node_modules なしで functions/ を束ねる（ci.yml）。ここからは相対パスのファイルだけを
// import する。npm のパッケージや @yamon/shared を値として import するとデプロイが失敗する（import type は可）
import { parseRange } from './range';

interface Env {
  /** 地図データを置いた R2 バケット。Pages のプロジェクト設定でバインドする（docs/MAP_DATA.md） */
  MAP_DATA?: R2Bucket;
}

/** 返してよい地図データの名前。バケットの中のほかのオブジェクトは返さない */
const NAME_PATTERN = /^[a-z0-9-]+\.pmtiles$/;
/** 参照先（どの日付のファイルを使うか）を書いたファイルの名前。地図データの名前の拡張子を .json にしたもの */
const POINTER_PATTERN = /^[a-z0-9-]+\.json$/;

/** 参照先・大きさ・ETag を覚えておく時間。タイルごとに R2 を読み直さずに済ませる */
const CACHE_TTL_MS = 60_000;

interface Meta {
  size: number;
  etag: string;
  httpEtag: string;
  at: number;
}
const metaCache = new Map<string, Meta>();
/** 地図データの名前 → 実際に返すファイル名（参照先がなければ名前そのもの） */
const keyCache = new Map<string, { key: string; at: number }>();

/** 参照先のファイル（地図データの更新のワークフローが書く。D33） */
export interface MapDataPointer {
  key: string;
  build: string;
  size: number;
  maxzoom: number;
  bounds: number[];
  updatedAt: string;
}

/**
 * GET /map/<名前>.pmtiles：R2 の地図データを Range 付きで返す（D28）。
 * GET /map/<名前>.json：今の地図データのビルド日などを返す（管理者画面の表示用、D33）。
 * 独自ドメインがなく R2 を直接公開できないため、Pages Functions を通す
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '');
  if (POINTER_PATTERN.test(path)) return servePointer(env.MAP_DATA, path);
  return serveMapData(request, env.MAP_DATA, path);
};

async function readPointer(bucket: R2Bucket, pointerName: string): Promise<MapDataPointer | null> {
  const object = await bucket.get(pointerName);
  if (!object) return null;
  try {
    const value = (await object.json()) as Partial<MapDataPointer>;
    // 書き間違いで、ほかのオブジェクトやパスを指さないようにする
    if (typeof value.key !== 'string' || !NAME_PATTERN.test(value.key)) return null;
    return value as MapDataPointer;
  } catch {
    return null;
  }
}

/** 実際に返すファイル名。参照先があればそこに書かれたもの、なければ名前そのもの（手作業で置いた最初のデータ） */
async function resolveKey(bucket: R2Bucket, name: string, refresh: boolean): Promise<string> {
  const cached = keyCache.get(name);
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.key;
  const pointer = await readPointer(bucket, name.replace(/\.pmtiles$/, '.json'));
  const key = pointer?.key ?? name;
  keyCache.set(name, { key, at: Date.now() });
  return key;
}

async function loadMeta(bucket: R2Bucket, key: string, refresh: boolean): Promise<Meta | null> {
  const cached = metaCache.get(key);
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  const head = await bucket.head(key);
  if (!head) {
    metaCache.delete(key);
    return null;
  }
  const meta = { size: head.size, etag: head.etag, httpEtag: head.httpEtag, at: Date.now() };
  metaCache.set(key, meta);
  return meta;
}

export async function serveMapData(
  request: Request,
  bucket: R2Bucket | undefined,
  name: string,
): Promise<Response> {
  if (!NAME_PATTERN.test(name)) return new Response('Not Found', { status: 404 });
  if (!bucket) return new Response('地図データの保存先（MAP_DATA）が設定されていません', { status: 503 });

  // 覚えている ETag と同じときだけ読む。参照先が切り替わった・差し替えられた（onlyIf が外れた・ファイルが消えた）ら、
  // 参照先と大きさを読み直して1回だけやり直す
  for (const refresh of [false, true]) {
    const key = await resolveKey(bucket, name, refresh);
    const meta = await loadMeta(bucket, key, refresh);
    if (!meta) {
      if (!refresh) continue;
      return new Response('Not Found', { status: 404 });
    }

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
    const object = await bucket.get(key, {
      range: { offset: start, length: end - start + 1 },
      onlyIf: { etagMatches: meta.etag },
    });
    if (!object || !('body' in object)) continue;

    if (!range) return new Response(object.body, { status: 200, headers });
    headers.set('Content-Range', `bytes ${start}-${end}/${meta.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response('地図データが更新中です。再読み込みしてください', { status: 503 });
}

/** 今の地図データの情報（ビルド日・大きさ・更新日時）。参照先がなければ 404 */
export async function servePointer(bucket: R2Bucket | undefined, pointerName: string): Promise<Response> {
  if (!POINTER_PATTERN.test(pointerName)) return new Response('Not Found', { status: 404 });
  if (!bucket) return new Response('地図データの保存先（MAP_DATA）が設定されていません', { status: 503 });
  const pointer = await readPointer(bucket, pointerName);
  if (!pointer) return Response.json({ error: { code: 'not_found', message: '参照先がありません' } }, { status: 404 });
  return Response.json(pointer, { headers: { 'Cache-Control': 'no-cache' } });
}

/** テスト用：覚えている参照先・大きさ・ETag を消す */
export function clearMapMetaCacheForTest() {
  metaCache.clear();
  keyCache.clear();
}
