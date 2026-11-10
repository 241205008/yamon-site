# 引き継ぎ資料（サークルの運用）

> **2026-11-10 更新（#16）**：本番の構築（#14・#15）の後に、実際の設定と照らして埋めました（下書きは #66）。【移すときに確認】の印は、まだ一度も行っていない作業で、実際に行うときに確かめる所です。

やもんサイト（自然観察会の記録）を、サークルが運用し続けるための資料です。保守（不具合の修正・更新）は開発者が担当します（D21）。この資料は、**代表が替わるときの引き継ぎ**と、**サークル側で行う定期の作業**を中心にしています。

- 本番の URL：https://yamon-site.yamonken.workers.dev
- 開発者の連絡先：サークルの LINE グループで共有する（リポジトリには書かない）。代表が替わったら、新しい代表がグループに入っていることを確かめる
- パスワード・トークン・鍵の**実値はこの資料に書きません**。名前と置き場所だけを書きます

## 1. 使っているサービス

すべてのサービスの持ち主は、**サークルの Gmail**（代表が代々引き継ぐアカウント）です（D21）。開発者などの個人のアカウントは、メンバーとして追加しています。

| サービス | 使い道 | 持ち主・ログイン | 支払い | 管理画面 |
|---|---|---|---|---|
| Cloudflare | 画面の配信（Workers の `yamon-site`）、地図データ（R2）、DB のバックアップ（R2 の `yamon-backup`） | サークルの Gmail。開発者は Super Administrator のメンバー | 無料枠（Workers：1日10万リクエスト、R2：10GB）。R2 を使うにはお支払い方法の登録が要り、**開発者のカード**を登録している（無料枠の範囲で0円。Google Cloud と同じく、支払い元を変えるときは 3-2） | https://dash.cloudflare.com |
| Google Cloud | API（Cloud Run の `yamon-api`、シンガポール）、イメージの置き場所（Artifact Registry）、秘密の値（Secret Manager） | サークルの Gmail。プロジェクト `yamon-site`（プロジェクト ID も `yamon-site`、番号 `240554689888`）。組織（Organization）には入れていない（自動で作られた組織 `yamonken07-meijo-org` は使っていない） | **開発者のクレジットカード**（請求先アカウント、D21）。無料枠の範囲で0円の見込み。予算アラートは月100円 | https://console.cloud.google.com |
| Neon | DB（PostgreSQL 17、シンガポール） | サークルの Gmail（Google でログイン）。組織「野生動物生態研究会」のプロジェクト `yamon-site`（ブランチ `production`、データベース `neondb`） | 無料プラン（0.5GB） | https://console.neon.tech |
| GitHub | ソースコード（`241205008/yamon-site`）、自動デプロイ・バックアップ・地図データの更新（Actions） | **開発者の個人アカウント**（将来、サークルの Organization へ移す。下の 4-3） | 無料（公開リポジトリ） | https://github.com/241205008/yamon-site |
| サークルの Gmail | 上のサービスの持ち主のアカウント。任意で招待・再設定のメールの送信元（D46） | 代表が引き継ぐ | 無料 | https://mail.google.com |

アカウントのいらないもの：背景の地図（Protomaps のデータを R2 に置いて配信、D28）、航空写真（国土地理院のタイル）。

## 2. 秘密の値（名前と置き場所）

| 名前 | 置き場所 | 何か | 作り直し方 |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub の Secret | 画面のデプロイ用。サークルの Cloudflare アカウントの **Account API Token**（テンプレート「Edit Cloudflare Workers」）。メンバーを外しても使えなくならない | Cloudflare の「Manage Account → Account API Tokens」で Roll（README の「デプロイ」） |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub の Secret | Cloudflare のアカウント ID（秘密ではない） | — |
| `R2_ACCESS_KEY_ID`・`R2_SECRET_ACCESS_KEY` | GitHub の Secret | 地図データの更新用（R2 の地図のバケットだけ） | docs/MAP_DATA.md |
| `BACKUP_R2_ACCESS_KEY_ID`・`BACKUP_R2_SECRET_ACCESS_KEY` | GitHub の production 環境の Secret | DB のバックアップ用（R2 の `yamon-backup` だけ） | docs/BACKUP.md |
| `DATABASE_URL` | GitHub の production 環境の Secret ／ Secret Manager の `yamon-database-url` | Neon の接続文字列（パスワードを含む）。**2か所に同じ値** | Neon でパスワードを変え、両方を登録し直す（docs/DEPLOY_API.md） |
| `yamon-proxy-secret` ／ Worker の `PROXY_SECRET` | Secret Manager ／ Cloudflare の Worker の Secret | Worker と API だけが知る値（D44）。**2か所に同じ値** | `setup-gcp.sh` で作り直し、Worker の方も同じ値に変える |
| `API_ORIGIN` | Cloudflare の Worker の Secret | Cloud Run の URL | Cloud Run を作り直したときだけ |
| `yamon-setup-token` | Secret Manager | 最初の管理者の登録用（D38）。登録が済んだら使われない | — |
| `yamon-github-map-data-token` | Secret Manager | 管理者画面の「地図データを更新」用。**開発者の GitHub の fine-grained token**（Actions: Read and write だけ）。**有効期限がある**（**2027-10-19 まで**。期限は GitHub の「Settings → Developer settings → Fine-grained tokens」で見られる） | 開発者が作り直し、`setup-gcp.sh` で上書きして CI を再実行（docs/DEPLOY_API.md の手順3） |
| `yamon-smtp-pass`（任意） | Secret Manager | メールも送る場合だけ。サークルの Gmail のアプリパスワード（D46） | Gmail のパスワードを変えると無効になる。作り直して上書き |
| `GCP_PROJECT_ID`・`GCP_WORKLOAD_IDENTITY_PROVIDER`・`GCP_SERVICE_ACCOUNT`・`SMTP_USER`・`BACKUP_BUCKET`・`MAP_DATA_BUCKET` | GitHub の Variable | 秘密ではない設定 | — |
| `PROTECTED_USER_IDS` | GitHub の Variable | 保守を担当する開発者のユーザー ID（D51）。この人は、管理者画面から降格・無効化・退会処理・再設定リンクの発行ができない（画面に「保守担当」と出る）。CI が Cloud Run の環境変数として渡す | 開発者が替わるときは下の 3-6 |

## 3. 代表が替わるときのチェックリスト

新しい代表と、前の代表・開発者が一緒に行います。上から順に、終わったら日付を書いてください（紙やサークルの共有の場所に。リポジトリには書かない）。

### 3-1. サークルの Gmail

- [ ] パスワードを変える（前の代表が知っている値を使えなくする）
- [ ] 2段階認証を引き継ぐ。今は有効で、ログインすると**確認用の端末に Google の確認画面が出て、それを押す**方式（2026-11-10 時点）。確認用の端末と電話番号を、新しい代表のものに変える（前の代表の端末は「セキュリティ → お使いのデバイス」から外す）。バックアップコードを作り直して紙で保管する（古い紙は捨てる）
- [ ] 再設定用のメールアドレス・電話番号を、新しい代表のものに変える
- [ ] メールも送る設定（`yamon-smtp-pass`）を使っている場合だけ：パスワードを変えるとアプリパスワードが無効になるので、作り直して開発者に渡し、Secret Manager を上書きしてもらう（D22・D46）

### 3-2. Cloudflare

- [ ] サークルの Gmail でログインできることを確かめる（パスワードは Cloudflare の方も変える）
- [ ] 2段階認証を引き継ぐ。今は**認証アプリ（Authenticator）**で設定済み（2026-11-10 時点）。新しい代表の認証アプリに移し（「My Profile → Authentication」で設定し直す）、リカバリーコードを作り直して紙で保管する（古い紙は捨てる）
- [ ] 支払い元を変える場合：R2 のために開発者のカードを登録している。「Manage Account → Billing」で、新しいお支払い方法に替えてから、古いものを消す
- [ ] 「Manage Account → Members」で、前の代表を外し、新しい代表を追加する（開発者は残す）
- [ ] API トークンは Account API Token なので、人を外しても止まらない。漏れた心配があるときだけ Roll する

### 3-3. Google Cloud

- [ ] サークルの Gmail でログインできることを確かめる
- [ ] 「IAM と管理 → IAM」で、前の代表を外し、新しい代表を「オーナー」で追加する（開発者は残す）
- [ ] 予算アラートの通知先（Monitoring の通知チャネル）がサークルの Gmail のままであることを確かめる
- [ ] 支払い元を変える場合（D21）：新しい請求先アカウントを作り、「お支払い → プロジェクトのお支払いを管理」でプロジェクトを付け替える。サービスは止まらない。付け替えた後で、古い請求先アカウントを閉じる

### 3-4. Neon

- [ ] サークルの Gmail（Google でログイン）で入れることを確かめる
- [ ] 「Organization → Members」で、前の代表を外し、新しい代表を追加する

### 3-5. サイトの管理者

- [ ] サイトの管理者画面で、新しい代表を「管理者」にし、前の代表を「OB・OG」にする（管理者は2人以上を保つ、D25。2026-11-10 時点では管理者は1人なので、まず2人目を立てる）
- [ ] 新しい管理者が、招待リンク・パスワード再設定リンクの出し方を知っている（下の 5）

### 3-6. 保守を担当する開発者が替わるとき（D51）

代表の交代とは別に、保守を担当する人が替わるときだけ行います。GitHub のリポジトリの管理者が行います（サイトの管理者画面からは変えられません）。

- [ ] 新しい開発者を、サイトに招待して「管理者」にする
- [ ] 新しい開発者が、本番のサイトにログインしたまま `https://yamon-site.yamonken.workers.dev/api/auth/me` を開き、`"id"` の値を確かめる
- [ ] `gh variable set PROTECTED_USER_IDS` で、新しい開発者の ID に書き換える（前の開発者の ID は消す）。Actions 画面で CI を main に対して手動実行する
- [ ] 管理者画面で、新しい開発者に「保守担当」の印が付き、前の開発者から消えたことを確かめる。その後、前の開発者の役割を変える（OB・OG など）か退会処理をする（印が付いている間はできない）
- 保守をする人がいなくなるときは、`gh variable delete PROTECTED_USER_IDS` で消して CI を再実行する

## 4. サービスごとの引き継ぎの手順（まとめて移すとき）

### 4-1. Google Cloud の支払い元と権限

- 請求先アカウント（カード）はプロジェクトとは別に管理されている。新しい持ち主が請求先アカウントを作り、プロジェクトの「お支払いを変更」で付け替える（[Google Cloud のドキュメント](https://docs.cloud.google.com/billing/docs/how-to/modify-project)）
- 権限は IAM で、新しい持ち主を「オーナー」にしてから、前の持ち主を外す。GitHub Actions のデプロイ用のサービスアカウント（`github-deployer`）と、API の実行用（`yamon-api-runtime`）は消さない

### 4-2. Cloudflare・Neon のメンバー

- どちらも「メンバーの招待」で権限を渡せる。持ち主のアカウント（サークルの Gmail）自体は変えない

### 4-3. GitHub リポジトリを移すとき（サークルの Organization へ）

リポジトリの名前が変わるため、次の所を直さないと、自動デプロイ・バックアップが止まります。開発者と一緒に行います。

- [ ] 移す前に、2章の Secret・Variable の名前の一覧を控える（値は控えない）。「Settings → Transfer」で移す。Issue・PR・履歴は残る。Secret・Variable・環境（production）が残るかは【移すときに確認】：移した後に `gh secret list`・`gh variable list`・`gh secret list --env production` で確かめ、なければ作り直して登録する
- [ ] Google Cloud の Workload Identity 連携は、リポジトリの ID（数字）と環境（`production`）で判定しているので（D50）、移しても直さなくてよい（ID は移しても変わらない）。`apps/api/deploy/setup-gcp.sh` も直さなくてよい。移した後の最初の main の CI で `Deploy API` が通ることを確かめ、通らなければ Cloud Shell でスクリプトをもう一度実行する
- [ ] 地図データの更新用の token（`yamon-github-map-data-token`）を、新しいリポジトリを対象にして作り直す。API の環境変数 `GITHUB_REPOSITORY`（なければ `241205008/yamon-site`）を、`ci.yml` の `--set-env-vars` に新しい名前で足す
- [ ] DB のバックアップの失敗通知は、`backup.yml` の `cron` の行を最後に変えた人に届く。新しい担当者が `cron` の行を変える commit を入れる（docs/BACKUP.md の「失敗したとき」）

## 5. 管理者がふだん行うこと

- **部員を招待する**：管理者画面で招待を作り、出てきたリンクを LINE などで本人にだけ送る（48時間・1回限り、D46）。期限が切れたら「リンクを作り直す」
- **パスワードを忘れた部員**：管理者画面の部員ごとの「再設定リンク」を発行して本人に送る（1時間・1回限り）。発行は操作履歴に残る
- **卒業・退部**：卒業しても閲覧を続ける人は「OB・OG」に、やめる人は「退会処理」（記録は残り、名前は「退会済みユーザー」になる、D26）
- **主な場所**：管理者画面の「主な場所」で追加・編集する。記録のある場所は消さずに「使わない」にする（D37）
- **地図データの更新**：管理者画面の「地図データを更新」を、年に1回程度押す。数十分で新しい地図に切り替わる。失敗しても今の地図は出続ける（docs/MAP_DATA.md、D34）

## 6. 定期の作業

| いつ | 何を | 誰が | 手順 |
|---|---|---|---|
| 毎月 | 請求額が0円（または数円）であることを見る | 代表 | Google Cloud の「お支払い → レポート」と、Cloudflare の「Manage Account → Billing」（R2 の使用量）。Google Cloud は予算アラートのメールが来たらすぐ見る。Cloudflare には予算アラートがないので、毎月見る |
| 毎月 | DB のバックアップから戻せるかを確かめる | 開発者（できれば代表と一緒に） | docs/BACKUP.md の「月1回の確認」。毎日成功しているか、60日で止まっていないかも見る |
| Node.js のセキュリティリリースのとき | Node.js の版を上げる | 開発者 | 下の 6-1 |
| token の期限（2027-10-19）の1か月前まで | 地図データの更新用の token を作り直す | 開発者 | 2 の表の `yamon-github-map-data-token` |
| 代表が替わるとき | 3 のチェックリスト | 代表・開発者 | — |

### 6-1. Node.js の版を上げる（D47）

1. [Node.js のセキュリティリリースの一覧](https://nodejs.org/en/blog/vulnerability)で、22.x に修正版が出たかを見る
2. Issue を立て、リポジトリのルートの `.node-version` と、`apps/api/Dockerfile` の `ARG NODE_VERSION` の既定値の2か所を、同じ新しい版にする（ずれると CI が止まる）
3. PR の CI が通ったらマージする。main の CI で API のイメージが作り直され、Cloud Run に出る
4. [SMOKE_TEST.md](SMOKE_TEST.md) の1を流す
5. Node.js 22 の保守は 2027-04 まで。それより前に、新しいメジャー版（24 など）へ移す相談をする

## 7. 運用上の注意

- **保護対象の生き物の位置**：部員・OB・OG には約1km単位に丸めて見せる（D39）。ただし**観察会の座標（「現在位置を使用」で作ったもの）は丸めない**。保護対象の生き物の生息地で観察会を開くときは、観察会の場所を「主な場所」か、名前だけの「その他の場所」で作る（観察会の座標から場所が分かってしまうため）
- **主な場所の初期データ**：幹部から一覧（CSV：`名前,緯度,経度`）が届いたら、`npm run db:import-locations -w @yamon/api -- <CSV> --apply` で本番の DB に入れる。手順は [SMOKE_TEST.md](SMOKE_TEST.md) の 2-2。`--apply` を付けなければ確認だけ
- **PR のプレビュー**：PR ごとに `https://pr-<番号>-yamon-site.yamonken.workers.dev` ができ、誰でも開ける。ただし API にはつながらないので、本番のデータは見えない（D45）
- **初めのアクセスが遅い**：しばらく使われないと、API（Cloud Run）と DB（Neon）が止まる。止まった後の最初のアクセスは数秒かかる（D14）。故障ではない
- **サークルのアカウントの2段階認証**：Gmail（確認用の端末で承認）と Cloudflare（認証アプリ）で設定済み。端末やアプリをなくしたときは、紙のバックアップコード・リカバリーコードでログインする。コードもないと、アカウントを取り戻すのに数日かかったり、取り戻せなかったりする
- **LINE から開くと位置情報が取れない**：LINE の中のブラウザには位置情報の許可がないため、「現在位置を取得」が「位置情報の利用が許可されていません」になる。部員には、リンクを Chrome や Safari で開くよう案内する（招待リンクを送るときに一言添える）
- **Cloud Shell と PC のターミナル**：手順書で「Cloud Shell で」と書いたコマンド（`setup-gcp.sh`、DB の復元）は、Google Cloud の画面の右上の「>_」で開く Cloud Shell で実行する。PC の PowerShell では動かない

## 8. 困ったとき

### 8-1. サイトが動かない

1. [SMOKE_TEST.md](SMOKE_TEST.md) の1（`bash scripts/smoke-test.sh`）を流し、どこで失敗するかを見る
2. 同じ資料の「失敗したときに見る所」を見る
3. 分からなければ開発者に連絡する（失敗の表示をそのまま伝える。パスワードなどは送らない）

### 8-2. 管理者が全員パスワードを忘れた（D46）

再設定リンクは管理者しか出せないので（保守を担当する開発者には、本人以外からは出せない、D51）、DB に直接、再設定のトークンを入れます。開発者か、Neon にログインできる人が行います。この手順は本番ではまだ試していません。SQL は実装（トークンの SHA-256 を16進で保存、リンクは `/reset-password?token=`）と照らして確かめました。初めて行うときは、先にテスト用のアカウントで試してください

1. 長い乱数を作る（Cloud Shell や Git Bash で `openssl rand -hex 32`）。これがリンクのトークンになる。誰にも送らない
2. Neon のダッシュボードの「SQL Editor」で、管理者の ID を調べる

   ```sql
   select id, name, email, status from users where role = 'admin' and status = 'active';
   ```

3. 同じ画面で、再設定のトークン（ハッシュ）を入れる。`<トークン>` と `<ユーザーの ID>` を置き換える

   ```sql
   insert into password_reset_tokens (token_hash, user_id, expires_at)
   values (encode(sha256(convert_to('<トークン>', 'UTF8')), 'hex'), '<ユーザーの ID>', now() + interval '1 hour');
   ```

4. 1時間以内に、`https://yamon-site.yamonken.workers.dev/reset-password?token=<トークン>` を、その管理者本人が開いて新しいパスワードを決める
5. 使ったトークンのメモを消す

### 8-3. 有効な管理者が1人もいない（全員が退会・無効化された）

D25 の仕組みで最後の管理者は外せないため、ふつうは起きません。起きたときは、Neon の SQL Editor で、残っている有効なユーザーの1人を管理者にしてから、8-2 を行います。

```sql
update users set role = 'admin' where id = '<ユーザーの ID>' and status = 'active';
```

### 8-4. データが消えた・壊れた

[BACKUP.md](BACKUP.md) の「復元」。戻るのは毎日 3:00 の時点まで。

## 9. まだ埋まっていない所

- 【移すときに確認】：GitHub リポジトリを移したときに Secret・Variable・環境が残るか（4-3）
- **管理者が1人だけ**（2026-11-10 時点）：パスワードを忘れると 8-2 の手順しかない。部員が入ったら、幹部の1人を2人目の管理者にする
- メールは送っていない（D46 の任意の設定を使っていない）ので、`yamon-smtp-pass`（Secret Manager）と `SMTP_USER`（GitHub の Variable）は登録していない。2 の表にあっても、ないのが正しい
- 2 の表の名前は、2026-11-10 に GitHub（`gh secret list`・`gh variable list`）と照らして合っていることを確かめた。Secret Manager と Cloudflare の名前は、本番の構築のときに登録した名前のまま
- 各サービスの画面の文言は変わることがある。特に 3-2 の Cloudflare の画面の名前（「My Profile → Authentication」「Manage Account → Billing」）は、実際の画面とまだ照らしていない。3 のチェックリストで画面が違ったら、この資料を直す PR を出す
