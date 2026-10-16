// Cloudflare Workers の入口（D42）。wrangler.jsonc の run_worker_first に書いたパス（/map/*）だけがここに来る。
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
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
      }
      const name = pathname.slice(MAP_PREFIX.length);
      return name.endsWith('.json') ? servePointer(env.MAP_DATA, name) : serveMapData(request, env.MAP_DATA, name);
    }
    // run_worker_first の設定を変えたときなど、それ以外のパスが来たら静的アセット（なければ index.html）を返す
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
