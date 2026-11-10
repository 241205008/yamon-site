# API・DB の本番環境（Cloud Run・Neon、メールは任意）

本番の API（`apps/api`）を Google Cloud Run に、DB を Neon に置きます。画面（Cloudflare Workers）の `/api/*` は Worker が Cloud Run へ転送します。招待とパスワード再設定のリンクは管理者画面に出し、管理者が LINE などで本人に渡すので、メールの設定は要りません（D46）。メールも送りたいときだけ、サークルの Gmail を設定します。構成と理由は [DECISIONS.md の D14・D44・D45・D46](DECISIONS.md) を参照してください。

```
ブラウザ ──> Cloudflare Workers（yamon-site.yamonken.workers.dev）
               ├ 画面のファイル（静的アセット）
               ├ /map/*  ──> R2（地図データ、docs/MAP_DATA.md）
               └ /api/*  ──> Cloud Run（yamon-api、asia-southeast1）  ※秘密のヘッダー付き
                                ├──> Neon（PostgreSQL 17、AWS シンガポール）
                                └──> サークルの Gmail（SMTP、任意）
```

- Cloud Run は、Worker が付ける秘密のヘッダー（`x-yamon-proxy-secret`）のないリクエストを 403 で断ります。Cloud Run の URL を直接開いても使えません
- PR のプレビュー（Workers Previews）には API の Secret がないので、`/api/*` は 503 になり、本番のデータは見えません
- main へのマージで、CI が「イメージのビルド → 本番 DB へのマイグレーション → Cloud Run の切り替え → 画面のデプロイ → Worker 経由の `/api/health` の確認」を順に行います（`.github/workflows/ci.yml`）

## 秘密の値の置き場所

実値はリポジトリ・Issue・PR に書きません。

| 値 | 置き場所 | 名前 |
|---|---|---|
| Neon の接続文字列 | Google Secret Manager / GitHub の production 環境の Secret（マイグレーションとバックアップ用） | `yamon-database-url` / `DATABASE_URL` |
| Gmail のアプリパスワード（任意） | Google Secret Manager | `yamon-smtp-pass` |
| 地図データ更新用の GitHub の token（D34） | Google Secret Manager | `yamon-github-map-data-token` |
| Worker と API で共有する秘密の値 | Google Secret Manager / Cloudflare の Worker の Secret | `yamon-proxy-secret` / `PROXY_SECRET` |
| 初回セットアップ用のトークン（D38） | Google Secret Manager | `yamon-setup-token` |
| Cloud Run の URL | Cloudflare の Worker の Secret | `API_ORIGIN` |
| サークルの Gmail のアドレス（任意） | GitHub の Variable（秘密ではないが、公開のリポジトリに書かない） | `SMTP_USER` |
| 守るユーザー（保守を担当する開発者）の ID（D51） | GitHub の Variable（秘密ではない） | `PROTECTED_USER_IDS` |

## 初回の設定

上から順に行います。各サービスのアカウントは、サークルの Gmail で作ります（D21）。

### 1. （任意）サークルの Gmail：メールも送る場合だけ

招待とパスワード再設定のリンクは管理者画面に出るので、この手順は飛ばしてよい（D46）。リンクを管理者画面に出すのに加えて、本人にメールでも送りたいときだけ行う。後からでも設定できる（手順4のスクリプトで `yamon-smtp-pass` を登録し、手順6で `SMTP_USER` を登録して、CI を再実行する）。

1. サークルの Gmail でログインし、[Google アカウントのセキュリティ](https://myaccount.google.com/security)で「2段階認証プロセス」を有効にする（電話番号か認証アプリを登録する）
2. [アプリ パスワード](https://myaccount.google.com/apppasswords)を開き、名前（例：`yamon-site`）を入れて「作成」を押す
3. 表示された16文字を控える（空白は入れずに使う）。この画面を閉じると二度と表示されない。手順4で Secret Manager に入れたら、控えたメモは消す

> サークルの Gmail のパスワードを変えると、アプリパスワードは無効になり、メールが送れなくなります。そのときはアプリパスワードを作り直し、手順4のスクリプトで `yamon-smtp-pass` を上書きしてから、CI を main に対して再実行してください（引き継ぎ資料 #16）。

### 2. Neon：データベース

1. [Neon](https://neon.com/) にサークルの Gmail で登録する（「Continue with Google」）。無料プラン（Free）のままにする
2. プロジェクトを作る：名前 `yamon-site`、Postgres のバージョン **17**、リージョン **AWS Asia Pacific (Singapore)**
3. ダッシュボードの「Connect」で、ブランチ `production`（または `main`）・データベース `neondb` を選び、**「Connection pooling」をオフ**にした接続文字列（`postgresql://...@ep-....ap-southeast-1.aws.neon.tech/neondb?sslmode=require`）を控える。手順4と手順6で使ったら、控えたメモは消す

### 3. GitHub：地図データ更新用の token（D34）

GitHub の「Settings」→「Developer settings」→「Fine-grained tokens」→「Generate new token」で作ります。

- Repository access：Only select repositories → `241205008/yamon-site`
- Permissions：Repository permissions の **Actions: Read and write** だけ（Metadata: Read は自動で付く）
- 有効期限：選べる一番長い期間にし、切れる前に作り直す（切れると管理者画面の「地図データを更新」が失敗する。地図はそのまま表示される）

token を控える。手順4で Secret Manager に入れたら、控えたメモは消す。作り直したときは、手順4のスクリプトをもう一度実行し、`yamon-github-map-data-token` だけを上書きする（ほかは「上書きしますか」に Enter）。

### 4. Google Cloud：プロジェクト・カード・各サービス

1. サークルの Gmail で [Google Cloud コンソール](https://console.cloud.google.com/)にログインし、利用規約に同意する
2. プロジェクトを作る（名前 `yamon-site`）。プロジェクト ID（例：`yamon-site-123456`）を控える
3. 「お支払い」で請求先アカウントを作り、開発者のクレジットカードを登録して、このプロジェクトにつなぐ（D21）。無料トライアルのクレジットの案内が出たら、そのまま進めてよい
4. 右上の「Cloud Shell をアクティブにする」（`>_` のアイコン）を押し、次を順に実行する。途中で、手順1〜3で控えた値を聞かれる（Neon の接続文字列と地図の token は必須。Gmail のアプリパスワードは、手順1を飛ばしたなら空のまま Enter）

   ```bash
   git clone https://github.com/241205008/yamon-site.git
   ```

   ```bash
   bash yamon-site/apps/api/deploy/setup-gcp.sh <プロジェクトID>
   ```

5. 最後に表示される3つの値（`GCP_PROJECT_ID`・`GCP_WORKLOAD_IDENTITY_PROVIDER`・`GCP_SERVICE_ACCOUNT`）と、作った秘密の値（`yamon-proxy-secret`・`yamon-setup-token`）を控える。控えたら `clear` で画面を消す。控え損ねたときは、Cloud Shell で `gcloud secrets versions access latest --secret=yamon-proxy-secret`（`yamon-setup-token` も同じ）で表示できる

### 5. 予算アラート（月100円）

想定外の課金に気づけるよう、サークルの Gmail に通知を届けます。

1. 「Monitoring」→「アラート」→「通知チャネルを編集」→「メール」の「新しく追加」で、サークルの Gmail を登録する
2. 「お支払い」→「予算とアラート」→「予算を作成」
   - 名前：`yamon-site 月100円`、対象：このプロジェクト、期間：毎月
   - 予算額：指定額 **100円**
   - しきい値：実績の 50%・90%・100%、予測の 100%
   - 「通知を管理」で「Cloud Monitoring のメール通知チャネルをこの予算にリンクする」をオンにし、1で登録したチャネルを選ぶ
3. 保存する。予算アラートは通知だけで、サービスは止まりません。届いたら「お支払い」→「レポート」で、何に課金されたかを確かめる

### 6. GitHub：Variable・Secret・環境の保護

ターミナルで次を実行し、聞かれたら値を貼り付けます（`gh` でログイン済みのこと）。

```bash
gh variable set GCP_PROJECT_ID
```

```bash
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER
```

```bash
gh variable set GCP_SERVICE_ACCOUNT
```

メールも送る場合（手順1を行った場合）だけ、サークルの Gmail のアドレスも登録する。

```bash
gh variable set SMTP_USER
```

```bash
gh secret set DATABASE_URL --env production
```

保守を担当する開発者のアカウントを、ほかの管理者の操作（降格・無効化・退会処理・再設定リンクの発行）から守る（D51）。開発者が本番で管理者として登録した後に行う。後からでも設定できる（登録して CI を再実行する）。

1. 本番のサイトに開発者のアカウントでログインしたまま、同じブラウザで `https://yamon-site.yamonken.workers.dev/api/auth/me` を開く。表示された `"id"` の値（`xxxxxxxx-xxxx-...` の形）が、開発者のユーザー ID
2. ID を Variable に登録する（聞かれたら ID を貼る。複数人を守るときはカンマ区切り）

   ```bash
   gh variable set PROTECTED_USER_IDS
   ```

3. Actions 画面で CI を main に対して手動実行する（Run workflow）。`Deploy API (Cloud Run)` が環境変数を渡す。Cloud Run のログに「守るユーザー（PROTECTED_USER_IDS）：1人」と出る
4. 管理者画面で、開発者に「保守担当」の印が付いていることを確かめる

Cloud Run の画面で環境変数を手で足しても、次のデプロイで消える（CI が毎回すべて上書きする）。必ず Variable で設定する。ID でない値を入れると API が起動しない（`Deploy API` が失敗する）ので、そのときは Variable を直して再実行する。

最後に、リポジトリの「Settings」→「Environments」→「production」で「Deployment branches and tags」を「Selected branches and tags」にし、`main` だけを追加する（Neon の接続文字列と Google Cloud へのログインを、main の CI だけに限る）。

### 7. 最初のデプロイ

1. Actions 画面で CI を main に対して手動実行する（Run workflow）。`Deploy API (Cloud Run)` が Cloud Run のサービスを作る。Summary に Cloud Run の URL が出る
   - この1回目は、Worker の Secret がまだないので、最後の「Check API through Worker」が失敗する。2へ進む
2. Cloudflare のダッシュボードで「Workers & Pages」→ `yamon-site` →「Settings」を開き、「Runtime variables and secrets」の「+ Add variable」を押す。「Select environment」は **Production にだけ**チェックを入れ（Previews は外す。プレビューを本番の API につながないため、D45）、「Secret」にチェックを入れたまま、次の2つを入れて「Add variable and deploy」を押す（「+ Add」で2行目を足せる）
   - `API_ORIGIN`：1の Cloud Run の URL（`https://yamon-api-....asia-southeast1.run.app`。最後に `/` を付けない）
   - `PROXY_SECRET`：手順4で表示された `yamon-proxy-secret` の値
   - 下の「Bindings」の「Add binding」は使わない（R2 などをつなぐ別の機能）
3. Actions 画面で、1の実行の失敗したジョブを再実行し（「Re-run failed jobs」、または `gh run rerun <実行ID> --failed`）、すべて成功することを確かめる
4. https://yamon-site.yamonken.workers.dev/login を開くと、ユーザーが0人なので `/setup` に移る。手順4で表示された `yamon-setup-token` と、最初の管理者の名前・メールアドレス・パスワードを入れて登録する（D38）
5. 管理者画面の「招待する」で自分以外のアドレスの招待リンクを作り、表示された文を LINE などで送る。受け取った人がリンクから登録できることを確かめる（手順1を行った場合は、同じリンクのメールも届く）

## 確かめ方・困ったとき

- **Worker 経由で動いているか**：`https://yamon-site.yamonken.workers.dev/api/health` が `{"status":"ok"}` を返す。Cloud Run の URL を直接開くと 403（`直接のアクセスは受け付けていません`）になるのが正しい
- **API のログ**：Google Cloud の「Cloud Run」→ `yamon-api` →「ログ」
- **`Deploy API` の「Authenticate to Google Cloud」で `The given credential is rejected by the attribute condition`**：Workload Identity 連携の条件が、GitHub から届くトークンに合っていない。前の版の `setup-gcp.sh`（`assertion.sub` で比べていた版）で作ったときに起きる（D50）。最新の main を Cloud Shell に取り込み（`git -C yamon-site pull`）、手順4のスクリプトをもう一度実行する（Secret の「上書きしますか」はすべて Enter）。条件がリポジトリの ID と環境（`production`）で判定する形に上書きされる。その後、失敗したジョブを再実行する
- **地図が出ず、航空写真だけが出る**：地図データ（R2）がまだ置かれていない。`https://yamon-site.yamonken.workers.dev/map/survey-area.json` が 503（保存先の R2 がつながっていない）か 404（ファイルがまだない）を返す。[MAP_DATA.md](MAP_DATA.md) の「3. 本番（Cloudflare R2）に置く」を行う
- **LINE で開くと「位置情報の利用が許可されていません」**：LINE の中のブラウザに位置情報の許可がない。リンクを Chrome や Safari で開く（LINE の画面の右下のメニュー →「ブラウザで開く」など）
- **503（この環境ではサーバーにつながりません）**：Worker の Secret（`API_ORIGIN`・`PROXY_SECRET`）が未登録。PR のプレビューでは、これが正しい動き
- **403 が Worker 経由でも出る**：Worker の `PROXY_SECRET` と Secret Manager の `yamon-proxy-secret` が違う。どちらかを合わせ、Secret Manager を変えたときは CI を再実行して Cloud Run に読み込ませる
- **招待・再設定のリンクが分からなくなった**：管理者画面で、招待は「リンクを作り直す」、パスワードは部員の「再設定リンク」を押す（前のリンクは使えなくなる）
- **パスワードを忘れた**：管理者が、管理者画面の部員の「再設定リンク」から発行して渡す。管理者自身が忘れたときは、もう1人の管理者に発行してもらう
- **メールが届かない**（手順1を行った場合）：サークルの Gmail の「送信済み」と受信箱（不達のエラーメール）を見る。アプリパスワードが無効になっていれば、手順1で作り直して `yamon-smtp-pass` を上書きし、CI を再実行する。メールが届かなくても、リンクは管理者画面に出ている
- **秘密の値を変えたとき**：Secret Manager の値は、Cloud Run の新しいインスタンスが起動するときに読まれる。CI を main に対して再実行すると確実に切り替わる
- **前の版に戻す**：Cloud Run の「リビジョン」で前のリビジョンにトラフィックを100%移す。イメージは新しい3つだけを残すので、戻せるのは2つ前のリビジョンまで。それより前に戻すときは、その commit で CI を実行し直す。マイグレーションは戻らないので、マイグレーションは前の版の API でも動く形（列の追加など）にしておく
