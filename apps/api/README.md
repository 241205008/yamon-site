# @yamon/api

バックエンド（Hono ＋ Drizzle ORM ＋ PostgreSQL）。技術選定の理由は [docs/DECISIONS.md](../../docs/DECISIONS.md) の D14〜D18・D22・D30・D31・D33・D35・D36・D38 を参照。

## 起動

リポジトリのルートで `npm run dev`（フロントと同時）または `npm run dev:api`（API だけ）。

| 環境変数 | 内容 |
|---|---|
| `DATABASE_URL` | PostgreSQL の接続文字列。なければ PGlite（`.data/pglite`）を使う。本番（`NODE_ENV=production`）では必須 |
| `PORT` | 本番（Cloud Run）で待ち受けるポート。既定 8080 |
| `API_PORT` | 開発で待ち受けるポート。既定 8787（`apps/web/vite.config.ts` の転送先と同じ。変えたら `API_URL` も合わせる） |
| `PGLITE_DIR` | 開発で PGlite のデータを置くフォルダ。既定 `.data/pglite` |
| `APP_URL` | メールに入れるリンクの起点（例 `https://yamon.pages.dev`）。なければ画面からのリクエストの `Origin` を使う。本番では設定する |
| `SMTP_USER` / `SMTP_PASS` | メール送信（サークルの Gmail のアドレスとアプリパスワード、D22）。なければ、開発ではメールをログに出し、本番では送らずにエラーにする |
| `SMTP_HOST` / `SMTP_PORT` | 既定は `smtp.gmail.com` / `465` |
| `MAIL_FROM` | 送信元の表示。既定は `やもんサイト <SMTP_USER>` |
| `SETUP_TOKEN` | 初回セットアップ（ユーザーが0人のときに最初の管理者を登録する）のトークン。20文字以上。なければ初回セットアップはできない（D38） |

開発用のアカウントとデモデータは `npm run db:seed -w @yamon/api` で入れる（リポジトリ直下の README の「開発用のアカウント」）。

## ルートを足すとき

- `src/app.ts` の `createApp` の中で `app.route()` でつなぐ。DB は `c.get('db')` で受け取る
- 入力は `packages/shared` の zod スキーマで `validate('json', schema)`（`src/validator.ts`）を通し、`c.req.valid('json')` で受け取る。誤りは 400 と項目ごとの理由（`ApiErrorBody`）で返る
- ログインや権限が要るルートは、`src/auth/middleware.ts` の `requireAuth` か `requirePermission('<できること>')` を差し込む。できることの対応表は `packages/shared/src/permissions.ts`（D24・D33）。未ログインは 401、権限なしは 403 になり、ハンドラーでは `c.get('user')` でログイン中のユーザーを受け取れる
  - 記録・観察会など作成者本人だけが直せるものは、対象を読んだ後で `assertCanActOn(c.get('user'), ownerId, 'records.editOwn')` を呼ぶ
- 状態を変えるメソッド（POST・PUT・PATCH・DELETE）は、本文を JSON（`Content-Type: application/json`）にする。それ以外は 415 で断る（CSRF 対策、D33）
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
