// 本番用のビルド。依存パッケージ（@yamon/shared を含む）を1ファイルにまとめ、
// コンテナに node_modules を入れずに動かす（イメージを小さくし、Cloud Run の起動を速くする）
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts', 'src/migrate.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // index.js と migrate.js で共通の部分（drizzle-orm など）を別ファイルにまとめる
  splitting: true,
  sourcemap: true,
  // PGlite はローカル開発とテスト専用。本番では DATABASE_URL の PostgreSQL を使う
  external: ['@electric-sql/pglite'],
  // src/db/client.ts は src/db/ から、ビルド後のファイルは dist/ から drizzle/ を探す
  define: { __MIGRATIONS_RELATIVE_PATH__: JSON.stringify('../drizzle') },
  // CommonJS の依存が require を使っても動くようにする
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
