# 使い方ガイドのスクリーンショット

使い方ガイド（`/guide`、#79・D53）の画像（`apps/web/public/guide-images/*.webp`）を撮り直す手順です。画面の見た目や文言を変えたら、関係する画像を撮り直します。

**本番の実データや個人情報を写さないため、開発サーバーとデモデータで撮ります。** スクリプトは `localhost` 以外の URL では動きません。

## 撮り方

1. デモデータを入れる（API を止めた状態で。入っていれば飛ばされる）

   ```bash
   npm run db:seed -w @yamon/api
   ```

2. 開発サーバーを起動する（フロント 5173 番と API 8787 番）

   ```bash
   npm run dev
   ```

3. 別のターミナルで、スクリプトを実行する

   ```bash
   node scripts/guide-screenshots/capture.mjs
   ```

   一部だけ撮り直すときは、ファイル名の一部を付ける（例：`node scripts/guide-screenshots/capture.mjs map admin-users`）。

4. 撮れた画像を目で確かめる（デモのアカウント・データだけが写っているか、切り取りがずれていないか）。`/guide` を開いて、文章と画像が合っているかも確かめる
5. 画像と一緒にコミットする

## スクリプトがすること

- パソコンに入っている Chrome（なければ Edge）を、画面を出さずに動かす（`playwright-core`。Playwright のブラウザのダウンロードは要らない。別のブラウザを使うときは `BROWSER_CHANNEL=msedge` など）
- 開発用のアカウント（README の「開発用のアカウント」）でログインし、役割ごとに画面を開いて撮る
  - スマホ幅（390px、2倍の解像度）：ホーム・記録・観察会・マップなど、現場で使う画面
  - パソコン幅（1280px）：管理者画面
- WebP（品質75）で `apps/web/public/guide-images/` に上書きする。画面全体のものと、カード1枚だけ切り取ったものがある（`capture.mjs` の `SHOTS`）
- 説明のために、開発の DB に次の変更をする（デモデータの中身は変わらない）
  - 招待リンクを作る（`new-member@example.com`・`new-officer@example.com`。招待履歴に残る）
  - 部員のパスワード再設定リンクを作る（パスワードは変わらない）
  - 部員の役割を幹部にして部員に戻す（操作履歴に残る）
  - 撮っている間だけ、デモの「ホタル」に「位置を保護する」印を付ける（終わったら戻す）
- マップは、地図データ（`.pmtiles`、Git に入っていない）がなくても背景が出るよう、国土地理院の航空写真に切り替えて撮る

開発の DB を最初の状態に戻したいときは、API を止めて `apps/api/.data/pglite` を消し、手順1からやり直します。

## 画像を足すとき

1. `capture.mjs` の `SHOTS` に、ファイル名・役割・幅・画面を開く手順を足す
2. `apps/web/src/guide/guides.ts` の該当するセクションに `image` を足す
3. 撮ってコミットする。`apps/web/src/pages/GuidePage.test.tsx` が、ガイドで使う画像がすべてあるかを確かめる
