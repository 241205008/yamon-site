# 地図データ（Protomaps・愛知・岐阜・三重・滋賀の4県）の用意と更新

基本の地図は、Protomaps（OpenStreetMap のデータを1ファイルにまとめた PMTiles 形式）から4県（愛知・岐阜・三重・滋賀）を囲む範囲を切り出したファイル `survey-area.pmtiles` を使います。理由と他の案は [DECISIONS.md の D28・D29・D33](DECISIONS.md) を参照してください。

**ふだんの更新は、管理者画面の「地図データを更新」ボタンで行います**（[4. 管理者画面から更新する](#4-管理者画面から更新する)）。下の 1〜3 は、最初の用意と、ボタンが使えないときの手作業の手順です。

ファイルは数百MBあるため、**Git には入れません**（`.gitignore` 済み）。本番は Cloudflare R2 に置き、開発では手元のファイルを使います。

## 今のデータ

| 項目 | 値 |
|---|---|
| 元データ | Protomaps の日次ビルド `20261015.pmtiles` |
| 切り出し範囲（西,南,東,北） | `135.7,33.65,137.95,36.55`（`packages/shared/src/area.ts` の `SURVEY_BOUNDS` と同じ） |
| ズーム | 0〜15（15 より拡大すると引き伸ばして描く） |
| 容量 | 379,586,240 バイト（約 380MB）。タイル 89,608 枚 |
| 切り出した日 | 2026-10-16 |

参考：東海3県だけ（西端 135.75）のときは 357MB。ズーム14までにすると、東海3県で 158MB。

## 1. 切り出す

1. Protomaps 公式の CLI（go-pmtiles）を [リリース](https://github.com/protomaps/go-pmtiles/releases) から取得する（Windows は `go-pmtiles_<版>_Windows_x86_64.zip` の `pmtiles.exe`）
2. 最新のビルド名を確かめる：https://build-metadata.protomaps.dev/builds.json の最後の `key`（例：`20261015.pmtiles`）
3. 先に容量だけ確かめる（`--dry-run`）。数秒で終わる

   ```bash
   pmtiles extract https://build.protomaps.com/20261015.pmtiles survey-area.pmtiles --bbox=135.7,33.65,137.95,36.55 --maxzoom=15 --dry-run
   ```

4. `--dry-run` を外して実行する（全体の約140GBのうち、必要な部分だけを HTTP で取るので、数分で終わる）
5. `pmtiles show survey-area.pmtiles` で `bounds` と `max zoom` を確かめる
6. この文書の「今のデータ」の表を更新し、PR にする

範囲を変えるときは、`SURVEY_BOUNDS` と `--bbox` を必ず同じ値にします（地図を動かせる範囲と、データがある範囲がずれるため）。

## 2. 開発環境で使う

切り出したファイルを `apps/web/map-data/survey-area.pmtiles` に置きます。`npm run dev` の開発サーバーが `/map/survey-area.pmtiles` で返します（`apps/web/vite.config.ts`）。

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

バインディングがない間、`/map/survey-area.pmtiles` は 503 を返し、地図の背景だけが出ません。

### ファイルを置く・差し替える

`wrangler r2 object put` は 300MB までしか送れないため、Cloudflare の画面（R2 → バケット → Upload）か、S3 互換のツール（rclone など）でアップロードします。

- オブジェクト名：`survey-area.pmtiles`（バケットの直下）
- 差し替えるときも同じ名前で上書きする。ETag が変わるので、開いている画面も次の読み込みで新しいデータに切り替わる
- ボタンで一度でも更新したあとは、参照先（`survey-area.json`）に書かれたファイルが使われ、`survey-area.pmtiles` は使われない。手作業で差し替えるときは、参照先を消すか書き換える（下の「1つ前のデータに戻す」）

差し替えたら、本番のマップ画面で地図が表示されることを確かめます。

## 4. 管理者画面から更新する

管理者画面の「地図データ」で「地図データを更新」を押すと、GitHub Actions のワークフロー（`.github/workflows/map-data.yml`）が次を行います（D33）。数分かかり、その間も今の地図が表示されます。

1. Protomaps の最新のビルドから、`SURVEY_BOUNDS` の範囲・ズーム15で切り出す（今と同じビルドなら何もしない）
2. 範囲・最大ズーム・容量（100MB〜2GB）・構造を検査する。合わなければ失敗にして、切り替えない
3. R2 に `survey-area-<ビルド日>.pmtiles` の名前で置き、大きさを確かめる
4. 参照先 `survey-area.json` を書き換える（ここで切り替わる。Functions が覚えている分を含め、1分ほどで反映）
5. 今のものと1つ前のもの以外の `survey-area-<日付>.pmtiles` を消す

画面には「更新中・完了・失敗」と開始時刻が出ます。失敗したときは「記録を見る」から Actions のログで理由を確かめます。Actions の画面（Actions → Map data → Run workflow）からも実行できます。同じビルドでも切り出し直すときは `force` に印を付けます。

### 自動更新の設定（初回のみ）

| 置き場所 | 名前 | 中身 |
|---|---|---|
| GitHub の Secret | `R2_ACCESS_KEY_ID`・`R2_SECRET_ACCESS_KEY` | R2 の API トークン（Cloudflare の R2 →「Manage API tokens」。権限は Object Read & Write、対象は地図のバケットだけ） |
| GitHub の Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID（デプロイと共通） |
| GitHub の Variable | `MAP_DATA_BUCKET` | 地図のバケット名（例：`yamon-map`） |
| Cloud Run の Secret（API） | `GITHUB_MAP_DATA_TOKEN` | GitHub の fine-grained personal access token。Repository access はこのリポジトリだけ、Permissions は **Actions: Read and write** だけ。期限を決め、切れる前に作り直す |
| Cloud Run の環境変数（API、任意） | `GITHUB_REPOSITORY` | `owner/repo`（省略時は `241205008/yamon-site`） |

- 実値はリポジトリ・Issue・PR に書かない
- `GITHUB_MAP_DATA_TOKEN` がない間、API は 503 を返し、画面に「設定されていません」と出る
- サークルへ引き継ぐときは、トークンをサークルのアカウントで作り直す（#16）
- ボタンを押せるのは管理者だけ（API でも `mapData.update` の権限を確かめる。#11）

### 1つ前のデータに戻す

新しいデータに問題があったときは、参照先を1つ前のファイルに書き換えます（R2 には1つ前のものが残っています）。

1. Cloudflare の画面（R2 → バケット）で、`survey-area-<日付>.pmtiles` のうち1つ前のものの名前を確かめる
2. `survey-area.json` をダウンロードし、`key` と `build` を1つ前のものに書き換えてアップロードする
3. 1分ほど待ってから、マップ画面で地図が表示されることを確かめる

参照先を消すと、手作業で置いた `survey-area.pmtiles` に戻ります。

## 更新の目安

- 年1回程度（OpenStreetMap の道路・建物の変化を取り込む）
- 主な場所の周りで、地図と現地が大きく違うと分かったとき
