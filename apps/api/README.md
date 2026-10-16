# @yamon/api

バックエンド（Hono ＋ Drizzle ORM ＋ PostgreSQL）。技術選定の理由は [docs/DECISIONS.md](../../docs/DECISIONS.md) の D14〜D18・D30・D31 を参照。

## 起動

リポジトリのルートで `npm run dev`（フロントと同時）または `npm run dev:api`（API だけ）。

| 環境変数 | 内容 |
|---|---|
| `DATABASE_URL` | PostgreSQL の接続文字列。なければ PGlite（`.data/pglite`）を使う。本番（`NODE_ENV=production`）では必須 |
| `PORT` | 本番（Cloud Run）で待ち受けるポート。既定 8080 |
| `API_PORT` | 開発で待ち受けるポート。既定 8787（`apps/web/vite.config.ts` の転送先と同じ。変えたら `API_URL` も合わせる） |
| `PGLITE_DIR` | 開発で PGlite のデータを置くフォルダ。既定 `.data/pglite` |

## ルートを足すとき

- `src/app.ts` の `createApp` の中で `app.route()` でつなぐ。DB は `c.get('db')` で受け取る
- 入力は `packages/shared` の zod スキーマで `validate('json', schema)`（`src/validator.ts`）を通し、`c.req.valid('json')` で受け取る。誤りは 400 と項目ごとの理由（`ApiErrorBody`）で返る
- テストは `test/helpers.ts` の `setupTestApp()` で、マイグレーション済みの PGlite と API を作り、`app.request()` で呼ぶ

## テーブルを変えるとき

1. `src/db/schema.ts` を直す
2. `npm run db:generate -w @yamon/api -- --name <変更の名前>` で `drizzle/` に SQL を作り、中身を確かめてコミットする
3. 本番の DB には `npm run db:migrate -w @yamon/api`（コンテナでは `node dist/migrate.js`）で流す。API の起動時には流さない（D30）

## コンテナ

```bash
docker build -f apps/api/Dockerfile -t yamon-api .
```

リポジトリのルートで実行する。CI（`API image (Docker)`）で、ビルド・PostgreSQL 17 へのマイグレーション・起動を確かめている。
