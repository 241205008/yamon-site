import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { parseRange } from './functions/map/range';

/**
 * 開発サーバーで、手元の地図データ（map-data/*.pmtiles、Git には入れない）を /map/ から返す。
 * 本番では同じ URL を Pages Functions（functions/map）が R2 から返す。手順は docs/MAP_DATA.md
 */
function localMapData(): Plugin {
  const dir = fileURLToPath(new URL('./map-data/', import.meta.url));
  return {
    name: 'yamon-local-map-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/map/', (req, res, next) => {
        // 名前は英小文字・数字・ハイフンだけなので、URL のデコードは要らない
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        if (!/^[a-z0-9-]+\.pmtiles$/.test(name)) return next();
        let size: number;
        try {
          size = statSync(dir + name).size;
        } catch {
          res.statusCode = 404;
          res.end(`map-data/${name} がありません。docs/MAP_DATA.md の手順で用意してください`);
          return;
        }
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'application/octet-stream');
        const range = parseRange(req.headers.range ?? null, size);
        if (range === 'invalid') {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${size}`);
          res.end();
          return;
        }
        const { start, end } = range ?? { start: 0, end: size - 1 };
        if (range) {
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        }
        res.setHeader('Content-Length', String(end - start + 1));
        // 読んでいる途中でファイルを差し替えても、開発サーバーごと落ちないようにする
        createReadStream(dir + name, { start, end })
          .on('error', () => res.destroy())
          .pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localMapData()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // ローカル開発では /api/* を API サーバー（apps/api、既定は 8787 番）へ転送し、本番と同じく同じオリジンにする（D15）
    // キーは '/api/'（'/api' だと '/apiary' のような画面のパスまで転送される）
    proxy: { '/api/': process.env.API_URL ?? 'http://localhost:8787' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
