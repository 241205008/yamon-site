# 地図データ（Protomaps・東海3県）の用意と更新

基本の地図は、Protomaps（OpenStreetMap のデータを1ファイルにまとめた PMTiles 形式）から東海3県の範囲を切り出したファイル `tokai.pmtiles` を使います。理由と他の案は [DECISIONS.md の D28・D29](DECISIONS.md) を参照してください。

ファイルは数百MBあるため、**Git には入れません**（`.gitignore` 済み）。本番は Cloudflare R2 に置き、開発では手元のファイルを使います。

## 今のデータ

| 項目 | 値 |
|---|---|
| 元データ | Protomaps の日次ビルド `20261014.pmtiles`（basemap 4.15.2） |
| 切り出し範囲（西,南,東,北） | `135.75,33.65,137.95,36.55`（`packages/shared/src/area.ts` の `TOKAI_BOUNDS` と同じ） |
| ズーム | 0〜15（15 より拡大すると引き伸ばして描く） |
| 容量 | 357,459,099 バイト（約 357MB）。タイル 87,255 枚 |
| 切り出した日 | 2026-10-15 |

参考：ズーム14までにすると 158MB。

## 1. 切り出す

1. Protomaps 公式の CLI（go-pmtiles）を [リリース](https://github.com/protomaps/go-pmtiles/releases) から取得する（Windows は `go-pmtiles_<版>_Windows_x86_64.zip` の `pmtiles.exe`）
2. 最新のビルド名を確かめる：https://build-metadata.protomaps.dev/builds.json の最後の `key`（例：`20261014.pmtiles`）
3. 先に容量だけ確かめる（`--dry-run`）。数秒で終わる

   ```bash
   pmtiles extract https://build.protomaps.com/20261014.pmtiles tokai.pmtiles --bbox=135.75,33.65,137.95,36.55 --maxzoom=15 --dry-run
   ```

4. `--dry-run` を外して実行する（全体の約140GBのうち、必要な部分だけを HTTP で取るので、数分で終わる）
5. `pmtiles show tokai.pmtiles` で `bounds` と `max zoom` を確かめる
6. この文書の「今のデータ」の表を更新し、PR にする

範囲を変えるときは、`TOKAI_BOUNDS` と `--bbox` を必ず同じ値にします（地図を動かせる範囲と、データがある範囲がずれるため）。

## 2. 開発環境で使う

切り出したファイルを `apps/web/map-data/tokai.pmtiles` に置きます。`npm run dev` の開発サーバーが `/map/tokai.pmtiles` で返します（`apps/web/vite.config.ts`）。

ファイルがないと、地図の背景が出ません（ピンや操作は動きます）。チームの共有場所からコピーするか、上の手順で切り出します。

別の場所のファイルを使うときは、`apps/web/.env.local` に `VITE_MAP_TILES_URL=<URL>` を書きます（Range リクエストに対応したサーバーに限る）。

## 3. 本番（Cloudflare R2）に置く

本番では `GET /map/<名前>.pmtiles` を Pages Functions（`apps/web/functions/map/[[path]].ts`）が受け、R2 のファイルを Range 付きで返します。独自ドメインがなく、R2 を直接公開できないためです。

### 初回の設定

1. R2 のバケットを作る（名前は例。無料枠：保存10GB、読み出し月1,000万回）

   ```bash
   npx wrangler r2 bucket create yamon-map
   ```

2. Cloudflare の画面で、Pages のプロジェクト →「Settings → Bindings」→「R2 bucket」を追加する
   - Variable name：`MAP_DATA`
   - R2 bucket：手順1のバケット
   - Production と Preview の両方に設定する
3. バインディングを変えたあとは、次のデプロイから有効になる。CI を手動実行（Run workflow）する

バインディングがない間、`/map/tokai.pmtiles` は 503 を返し、地図の背景だけが出ません。

### ファイルを置く・差し替える

`wrangler r2 object put` は 300MB までしか送れないため、Cloudflare の画面（R2 → バケット → Upload）か、S3 互換のツール（rclone など）でアップロードします。

- オブジェクト名：`tokai.pmtiles`（バケットの直下）
- 差し替えるときも同じ名前で上書きする。ETag が変わるので、開いている画面も次の読み込みで新しいデータに切り替わる

差し替えたら、本番のマップ画面で地図が表示されることを確かめます。

## 更新の目安

- 年1回程度（OpenStreetMap の道路・建物の変化を取り込む）
- 主な場所の周りで、地図と現地が大きく違うと分かったとき
