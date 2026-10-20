# やもんサイト

自然観察会の記録管理 Web アプリ（プロトタイプ）。招待制で、観察記録・観察会・生き物・場所を API（Hono）と PostgreSQL に保存します。

> フロントエンドとバックエンドを分けた構成へ移行中です。合意した MVP は [docs/MVP.md](docs/MVP.md)、採用した技術は [docs/DECISIONS.md](docs/DECISIONS.md) の D14〜D41 を参照してください。

## 起動

```bash
npm install
npm run dev
```

http://localhost:5173 を開きます。フロント（Vite、5173番）と API（Hono、8787番）が同時に起動し、`/api/*` は Vite から API へ転送されます（http://localhost:5173/api/health で確認できます）。画面のデータはすべて API から読み書きします（ブラウザの localStorage には保存しません）。

API の DB は、`DATABASE_URL` がなければ PGlite（WebAssembly 版の PostgreSQL）を `apps/api/.data/pglite` に作って使います。Docker や PostgreSQL のインストールは要りません。DB を空に戻したいときは、API を止めて `apps/api/.data/` を削除します。

地図の背景（Protomaps の愛知・岐阜・三重・滋賀の4県、約380MB）は Git に入っていません。`apps/web/map-data/survey-area.pmtiles` に置くと表示されます。用意と更新の手順は [docs/MAP_DATA.md](docs/MAP_DATA.md) を参照してください（なくても、地図の背景以外は動きます）。

リポジトリのルートで実行します。各コマンドは、中身のあるパッケージ（workspace）すべてに対して動きます。

| コマンド | 内容 |
|---|---|
| `npm run dev` | フロントと API の開発サーバーを同時に起動 |
| `npm run dev:web` / `npm run dev:api` | どちらか片方だけ起動 |
| `npm run build` | 型チェック＋本番ビルド（`apps/web/dist/`、`apps/api/dist/`） |
| `npm test` | 単体テスト（Vitest。API のテストは PGlite 上で動く） |
| `npm run typecheck` | 型チェックのみ |
| `npm run db:generate -w @yamon/api` | `apps/api/src/db/schema.ts` の変更からマイグレーションを作る（`apps/api/drizzle/` に出力。一緒にコミットする） |
| `npm run db:migrate -w @yamon/api` | `DATABASE_URL` の DB にマイグレーションを流す |
| `npm run db:seed -w @yamon/api` | 開発用のアカウントとデモデータを入れる（下記。表ごとに空のときだけ。ローカルの PGlite 専用で、`DATABASE_URL` があるときは動かない） |
| `npm run db:import-locations -w @yamon/api -- <CSV> [--apply]` | 主な場所の一覧（名前,緯度,経度）を DB に入れる（下記。`--apply` なしは確認だけ） |

特定のパッケージだけ動かすときは `-w` を付けます（例：`npm test -w @yamon/shared`）。

> TLS 検査のあるネットワークで `npm install` が証明書エラーになる場合は、`NODE_OPTIONS=--use-system-ca` を付けて実行してください。

## 初回セットアップ（本番）

ユーザーが1人もいない状態でサイトを開くと、`/setup`（初回セットアップ）が表示されます。API の環境変数 `SETUP_TOKEN`（20文字以上。`openssl rand -base64 32` などで作る）と同じトークンを入力した人だけが、最初の管理者を登録できます（D38）。登録後は、管理者画面から他のメンバーを招待します。

## 開発用のアカウント

ログインは API の DB で確かめます。最初に、API を止めた状態で次を1回実行します（PGlite は同時に1つのプロセスしか開けません）。

```bash
npm run db:seed -w @yamon/api
```

| 役割 | メールアドレス | パスワード |
|---|---|---|
| 管理者 | admin@example.com | password123 |
| 幹部 | officer@example.com | password123 |
| 部員 | member@example.com | password123 |
| OB・OG | obog@example.com | password123 |

同じコマンドで、主な場所（仮の5か所）と、デモの生き物・観察会・記録も入ります（それぞれの表が空のときだけ）。データを作り直したいときは、API を止めて `apps/api/.data/pglite` を消してから、もう一度実行します。

## 主な場所の初期データ

幹部から届いた主な場所の一覧は、CSV（1行に `名前,緯度,経度`。1行目は見出しでもよい）にして入れます。`DATABASE_URL` があればその DB（本番は Neon）、なければローカルの PGlite に入ります（PGlite のときは API を止めてから実行します）。

```bash
npm run db:import-locations -w @yamon/api -- 主な場所.csv
```

まず確認だけが表示されます（DB は変わりません）。内容がよければ、`--apply` を付けてもう一度実行します。同じ名前の場所は飛ばし、1行でも誤り（4県の範囲外など）があれば何も入れません。登録した後の追加・編集・「使わない」は、管理者画面の「主な場所」で行います（D37）。

## 画面

| パス | 画面 |
|---|---|
| `/login` | ログイン・招待リンクからの登録（`/login?invite=<トークン>`。登録画面に個人情報の扱いを表示） |
| `/setup` | 初回セットアップ（ユーザーが1人もいないときだけ） |
| `/privacy` | 個人情報の扱い（ログインしていなくても読める。各画面の下のリンクから開く） |
| `/forgot-password` | パスワード再設定のメールを送ってもらう（ログイン画面の「パスワードを忘れた方はこちら」から） |
| `/reset-password` | メールのリンク（1時間有効・1回限り）から新しいパスワードを設定する |
| `/` | 観察記録の追加・編集・削除、観察会作成、生き物管理 |
| `/map` | 座標付き記録の地図表示（生き物・月・時間帯で絞り込み） |
| `/locations` | 主な場所ごとの生き物一覧 |
| `/event-list` | 観察会一覧と統計 |
| `/event-detail/:eventId` | 観察会内の記録管理 |
| `/admin` | 招待・役割の変更・無効化・退会処理・操作履歴（管理者のみ） |

`/login` 以外はログインが必要です。ログインしたままでいられるのは最大8時間です。`/admin` に管理者以外が入るとホームへ戻ります（権限は API でも確かめます）。

## 招待の流れ

1. 管理者が `/admin` の「招待する」でメールアドレスと役割を選び、「招待リンクを作る」を押す
2. 画面に招待リンク（48時間有効・1回限り）と送る文が出るので、コピーして LINE などで相手に送る。メールの設定（SMTP）があれば、同じリンクのメールも届く（D46）
3. 相手がリンクを開き、ユーザー名とパスワードを設定して登録する（そのままログインした状態になる）

管理者は `/admin` で、招待リンクの作り直し・取り消し、パスワード再設定のリンクの発行、役割の変更（管理者／幹部／部員／OB・OG）、無効化・有効化、退会処理ができ、操作履歴を見られます。最後の1人の管理者は、降格・無効化・退会させられません。

## 構成

npm workspaces で、フロント・バック・共有コードを分けています（docs/DECISIONS.md D20）。

```
apps/
  web/                フロントエンド（@yamon/web）
    src/lib/          API の呼び出し・ログイン状態・TanStack Query
    src/components/   共通 UI、RecordForm、EventForm、地図ピッカーなど
    src/pages/        各画面
    worker/           Cloudflare Workers の入口（/map/* を地図配信へ、それ以外は画面のファイル）
    worker/map/       地図データの配信（R2 のファイルを Range 付きで返す。worker/index.ts から呼ぶ）
    wrangler.jsonc    Cloudflare Workers の設定
    map-data/         開発用の地図データ（Git に入れない）
  api/                バックエンド（@yamon/api）。Hono ＋ Drizzle ORM ＋ PostgreSQL
    src/app.ts        API の本体（ルートはここにつなぐ）
    src/db/           テーブル定義（schema.ts）と DB への接続
    drizzle/          マイグレーション（SQL）
    test/             API のテスト（PGlite）
    Dockerfile        Cloud Run 用のコンテナ
packages/
  shared/             フロントとバックで共有するコード（@yamon/shared）
                      固定マスター（カテゴリ・時間帯・役割・主な場所）、入力チェック（zod）、日時（JST）、地図の範囲（愛知・岐阜・三重・滋賀の4県）
docs/
  MVP.md              合意した MVP
  DECISIONS.md        技術選定・仕様の解釈とその理由
  MAP_DATA.md         地図データの切り出し・配置・更新の手順
```

仕様との差分や判断の理由は [docs/DECISIONS.md](docs/DECISIONS.md) にまとめています。

## デプロイ

GitHub Actions（`.github/workflows/ci.yml`）で、型チェック・テスト・ビルドが通ったあとに Cloudflare Workers へデプロイします。画面のファイルは静的アセットとして配信し、`/map/*`（地図データ）と `/api/*`（API。Cloud Run へ転送する）だけ Worker を通します。main では、画面の前に API を Cloud Run へデプロイします。理由と他の案は [docs/DECISIONS.md の D42・D23・D44・D45](docs/DECISIONS.md) を参照してください。

API・DB・メール（Cloud Run・Neon・Gmail）の準備は [docs/DEPLOY_API.md](docs/DEPLOY_API.md) を参照してください。準備が終わるまで（GitHub の Variable `GCP_PROJECT_ID` がない間）は、API のデプロイを省略します。

| きっかけ | デプロイ先 |
|---|---|
| main への push（PR の Merge） | 本番（`https://yamon-site.<サブドメイン>.workers.dev`） |
| 同じリポジトリからの PR | プレビュー（Workers Previews、`https://pr-<PR番号>-yamon-site.<サブドメイン>.workers.dev`。本番は変わらない。URL は Actions の実行結果の Summary に出る）。プレビューは本番の API につながらず、ログインやデータの表示はできない（D45） |
| Actions 画面からの手動実行（Run workflow） | main なら本番、それ以外はプレビュー（`b-<Branch名>-yamon-site...`） |

Secret が未設定の間は、デプロイだけ警告付きで省略されます（CI は失敗しません）。

今の本番は https://yamon-site.yamonken.workers.dev です（サブドメインは `yamonken`。2026-10-16 に初回デプロイ）。

### 初回の設定

Cloudflare のアカウントは、サークルの Gmail で作ったものを使います（D21）。作業は、メンバーに招待した個人のアカウントで行って構いません。ただし、アカウントの API トークン（手順2）を作れるのは Super Administrator（または API Token Provisioning の権限を持つ人）だけです。サークルと個人のどちらのアカウントでログインしても、画面の左上でサークルのアカウントを選んで作業すれば、作ったもの（サブドメイン・トークン・Worker）はサークルのアカウントの持ち物になります。

1. **workers.dev のサブドメインを確かめる**：アカウントを作るとメールアドレスをもとに自動で付く（例：`yamonken07-meijo`）。「Workers & Pages」の「Account details」の「Subdomain」に表示され、鉛筆のアイコンから変えられる。URL の `<サブドメイン>` の部分になり、公開後に変えるとすべての URL（招待メールのリンクなど）が変わるので、最初のデプロイの前に決める
2. **API トークンを作る**：「Manage Account → Account API Tokens」（アカウントが持つトークン。メンバーを外しても使えなくならない）で「Create Token」→ テンプレート「Edit Cloudflare Workers」を選ぶ。対象はこのアカウント（とそのゾーン）だけにし、「Full account and zone access」「Write all resources」は選ばない。名前は用途が分かるもの（例：`github-actions-deploy-yamon-site`）、有効期限は「No expiration」（期限が切れると自動デプロイが止まる）、IP の制限は空（GitHub Actions の IP は毎回変わる）にする
   - 作成後の画面には、トークンのほかに **Access Key ID・Secret Access Key**（R2 を S3 互換で使うための鍵）も出るが、使わないので保存しない。R2 には専用のトークンを別に作る（D34）
   - トークンは手順3で GitHub に登録したら、控えたメモを消す。値が要るときは作り直す（Roll）。どこかに貼ってしまったら Roll してから登録し直す
3. **GitHub に登録する**（実値はリポジトリ・Issue・PR に書かない）。ターミナルで次を実行し、聞かれたら値を貼り付ける

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN
   ```

   ```bash
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

   アカウント ID は「Workers & Pages」の右側に表示されている

4. **最初の本番デプロイ**：Actions 画面で CI を main に対して手動実行する（Worker はここで作られる）。Summary の URL を開き、画面が表示されることを確かめる。ログの途中に出る `npx canceled due to missing packages` は、wrangler-action が wrangler の有無を確かめたときのもので、そのあと入れ直して進むので問題ない

地図データ（R2）の準備は [docs/MAP_DATA.md](docs/MAP_DATA.md) を参照してください。R2 のバケットができるまでは、`/map/*` が 503 を返し、背景の地図（Protomaps）だけが表示されません。

画面のパス（例：`/event-detail/xxx`）を直接開いたり再読み込みしたりしたときは、`wrangler.jsonc` の `not_found_handling: "single-page-application"` により index.html が返ります。

## 開発の進め方

Issue（チケット）単位で開発します。Branch・Pull Request・Statusの運用は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。タスクは GitHub Project「やもんサイト」で管理しています（Project は非公開のため、リンクはオーナーのみ開けます：https://github.com/users/241205008/projects/3）。
