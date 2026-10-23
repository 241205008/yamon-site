# DB のバックアップと復元

本番の DB（Neon）を、GitHub Actions（`.github/workflows/backup.yml`）が毎日 3:00（日本時間）に `pg_dump` で書き出し、Cloudflare R2 のバックアップ用バケットに置きます。古いものは R2 のライフサイクルルールで3日後に消えます。理由と他の案は [DECISIONS.md の D32・D49](DECISIONS.md) を参照してください。

```
GitHub Actions（毎日 3:00）
  └ pg_dump（postgres:17 のイメージ）──> Neon（本番の DB）
  └ aws s3 cp ──> R2 の yamon-backup バケット（yamon-<UTC の日時>.dump、3日で自動削除）
```

- ファイルは `pg_dump` の custom 形式で、圧縮済みです。中身は `pg_restore` でしか読めません
- 所有者と権限は書き出しません。戻す先の DB のユーザー名が違っても戻せます
- 個人情報（名前・メールアドレス・パスワードのハッシュ）を含みます。バケットは公開せず、ファイルを手元に落としたら使い終わったら消してください

## 書き出し・復元のスクリプト

どれも Docker が要ります（`postgres:17` の公式イメージで動かすので、手元に PostgreSQL を入れる必要はありません）。Cloud Shell には Docker が入っています。

| スクリプト | すること |
|---|---|
| `scripts/db-backup/dump.sh <ファイル>` | `DATABASE_URL` の DB を書き出す。書き出したファイルの目次が読めることも確かめる |
| `scripts/db-backup/restore.sh <ファイル>` | `TARGET_DATABASE_URL` の**空の** DB に戻す。1つのトランザクションで戻し、途中で失敗したら何も入れない |
| `scripts/db-backup/compare.sh <URL1> <URL2>` | 2つの DB の表ごとの行数と中身の MD5 を比べる |

PR でこれらのスクリプトか `backup.yml` かマイグレーション（`apps/api/drizzle/`）を変えると、`Verify dump and restore` のジョブが、テスト用の DB（PostgreSQL 17）で「マイグレーション → テスト用のデータ（`scripts/db-backup/sample-data.sql`）→ 書き出し → 別の DB に戻す → 比べる → 戻した DB にマイグレーションを流し直す」を確かめます。

## 初回の設定

本番の DB（[DEPLOY_API.md](DEPLOY_API.md)）ができた後に行います。Cloudflare はサークルのアカウントで作業します（D21）。R2 を使うには、Cloudflare のアカウントにお支払い方法の登録が要ることがあります（無料枠の範囲なら請求は0円）。

1. **バケットを作る**：Cloudflare の「R2 Object Storage」→「Create bucket」。名前 `yamon-backup`、Location は「Automatic」（または Asia-Pacific）。地図データのバケット（#25）とは分ける
2. **3日で消すルール**：作ったバケットの「Settings」→「Object lifecycle rules」→「Add rule」
   - 名前：`delete-after-3-days`
   - 対象：プレフィックス `yamon-`（またはバケット全体）
   - 「Delete objects」を **3 days** after object creation
3. **専用の API トークン**：「R2 Object Storage」→「Manage API tokens」→「Create Account API token」
   - 名前：`github-actions-backup-yamon-site`
   - 権限：**Object Read & Write**、対象のバケットは **`yamon-backup` だけ**（地図データのバケットに書けないようにする）
   - 有効期限：なし（切れるとバックアップが止まる）
   - 作成後に出る **Access Key ID** と **Secret Access Key** を控える（この画面でしか見られない）
4. **GitHub に登録する**（リポジトリのルートで。聞かれたら値を貼り付ける）。`DATABASE_URL`（production 環境）と `CLOUDFLARE_ACCOUNT_ID` は、DEPLOY_API.md と README の「デプロイ」で登録済みのものを使う

   ```bash
   gh secret set BACKUP_R2_ACCESS_KEY_ID --env production
   ```

   ```bash
   gh secret set BACKUP_R2_SECRET_ACCESS_KEY --env production
   ```

   ```bash
   gh variable set BACKUP_BUCKET --body yamon-backup
   ```

5. **1回目を手で流す**：Actions 画面の「DB backup」→「Run workflow」（main）。`Backup (Neon → R2)` が成功し、Summary にファイル名が出て、R2 のバケットにファイルがあることを確かめる
6. **戻せることを確かめる**：下の「月1回の確認」を1回行う

控えた鍵は、GitHub に登録したら消してください。

## 失敗したとき

- **通知**：定期実行が失敗すると、GitHub から失敗のメールが届きます。届くのは、**`backup.yml` の `cron` の行を最後に変えた人**です（GitHub の決まり）。引き継ぎのときは、新しい担当者が `cron` の行を変える commit（時刻の変更や、コメントの追加でよい）を入れて、通知の届け先を移します（#16）
- **60日で止まる**：公開リポジトリでは、60日間 commit などの動きがないと、GitHub が定期実行を自動で止めます（止める前にメールが届く）。止まったら Actions 画面の「DB backup」で「Enable workflow」を押します。月1回の確認（下）で、最後の実行の日付も見てください
- **よくある原因**：Neon の接続文字列が変わった（パスワードの変更など）→ `DATABASE_URL` を登録し直す。R2 のトークンを消した・作り直した → 手順3・4をやり直す

## 復元（本番の DB が壊れた・消えたとき）

使っている本番の DB に、直接は戻しません。新しい空の DB に戻してから、つなぎ先を切り替えます。

1. **バックアップを選ぶ**：R2 の `yamon-backup` バケットで、壊れる前の日時（UTC。日本時間は9時間足す）のファイルを選び、「Download」で落とす。Cloud Shell で作業するなら、Cloud Shell の「アップロード」でファイルを送る
2. **空の DB を作る**：Neon のダッシュボードで、同じプロジェクトに新しいデータベース（例 `neondb_restored`）を作り、その接続文字列（Connection pooling はオフ）を控える。Neon のプロジェクトごと使えないときは、新しいプロジェクト（Postgres 17、シンガポール）を作る
3. **戻す**：Cloud Shell でリポジトリを clone し、次を実行する（`read` は表示なしで入力を待つので、接続文字列を貼り付けて Enter）

   ```bash
   read -rsp "戻す先の接続文字列: " TARGET_DATABASE_URL && echo && export TARGET_DATABASE_URL
   ```

   ```bash
   bash scripts/db-backup/restore.sh ./yamon-20261024-180000.dump
   ```

4. **つなぎ先を切り替える**：`apps/api/deploy/setup-gcp.sh` を実行し、`yamon-database-url` だけを新しい接続文字列で上書きする（ほかは「上書きしますか」に Enter）。GitHub の production 環境の `DATABASE_URL` も登録し直す（`gh secret set DATABASE_URL --env production`）
5. **反映する**：Actions 画面で CI を main に対して再実行する（マイグレーションが流れ、Cloud Run が新しい接続文字列で起動する）。[SMOKE_TEST.md](SMOKE_TEST.md) の1を流し、画面で記録が見えることを確かめる
6. 壊れた方の DB は、原因が分かるまで消さずに残す

戻るのはバックアップを取った時点（毎日 3:00）までです。その後に入れた記録は失われるので、部員に入れ直してもらいます。

## 月1回の確認（戻せるかを確かめる）

バックアップがあっても、戻せなければ意味がありません。月に1回、次を行います（#16 の引き継ぎ資料のチェックリストにも入れる）。

1. Actions 画面の「DB backup」で、毎日成功していること、最後の実行が昨日か今日であることを見る
2. R2 の `yamon-backup` に、3日分（3〜4個）のファイルがあることを見る（多すぎればライフサイクルルールを、少なければ失敗を確かめる）
3. 一番新しいファイルを落とし、「復元」の手順2〜3で、Neon の確認用のデータベース（例 `restore_check`）に戻す
4. 本番と、表ごとの行数を並べて見る。本番はバックアップの後も記録やログインで変わるので、ぴったりは一致しない。`users`・`observation_records`・`events`・`creatures`・`main_locations` の行数がほぼ同じ（バックアップの後に増えた分だけ本番が多い）なら OK。戻した方が明らかに少ない・表がない（`-`）なら、バックアップが壊れている

   ```bash
   read -rsp "本番の接続文字列: " PROD_URL && echo
   ```

   ```bash
   bash scripts/db-backup/compare.sh --counts "$PROD_URL" "$TARGET_DATABASE_URL"
   ```

5. 確認用のデータベースを Neon で消し、落としたファイルを消す（`rm`）。`unset PROD_URL TARGET_DATABASE_URL` で接続文字列も消す
