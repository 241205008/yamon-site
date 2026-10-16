// Cloudflare Workers の入口（D42）。wrangler.jsonc の run_worker_first に書いたパス（/map/*）は必ずここを通る。
// ほかに、どの静的ファイルにも当たらないリクエスト（古いファイル名の /assets/*.js など）もここに来る。
// CI のデプロイは node_modules なしで束ねるため、相対パスのファイルだけを import する（import type は可）
import { serveMapData, servePointer } from '../functions/map/[[path]]';

export interface Env {
  /** 画面のファイル（dist/）。wrangler.jsonc の assets */
  ASSETS: Fetcher;
  /** 地図データを置いた R2 バケット。wrangler.jsonc の r2_buckets で設定する（docs/MAP_DATA.md） */
  MAP_DATA?: R2Bucket;
}

const MAP_PREFIX = '/map/';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(MAP_PREFIX)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      const name = pathname.slice(MAP_PREFIX.length);
      const response = await (name.endsWith('.json')
        ? servePointer(env.MAP_DATA, name)
        : serveMapData(request, env.MAP_DATA, name));
      // HEAD は GET と同じヘッダー・状態で、本文だけを返さない
      if (request.method === 'HEAD') {
        await response.body?.cancel();
        return new Response(null, { status: response.status, headers: response.headers });
      }
      return response;
    }
    // どの静的ファイルにも当たらなかったリクエスト。静的アセットの設定（なければ index.html）に任せる
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
