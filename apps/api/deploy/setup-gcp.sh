#!/usr/bin/env bash
# Google Cloud の初回準備（docs/DEPLOY_API.md の手順3）。Cloud Shell で、プロジェクト ID を付けて実行する：
#   bash apps/api/deploy/setup-gcp.sh <プロジェクトID>
# 2回目以降に実行しても、作り済みのものはそのまま使う（Secret は上書きするか聞く）。
# 秘密の値は画面に表示せずに入力する。リポジトリ・Issue・PR には書かない（D21）
set -euo pipefail

PROJECT_ID="${1:?使い方: bash apps/api/deploy/setup-gcp.sh <プロジェクトID>}"
# Neon（AWS のシンガポール）の近く。理由は D44
REGION=asia-southeast1
# GitHub Actions の production 環境（main からしか使えない）のジョブだけが、デプロイ用のサービスアカウントになれる
GITHUB_SUBJECT="repo:241205008/yamon-site:environment:production"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="yamon-api-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

echo "== 1. API を有効にする"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

echo "== 2. コンテナイメージの置き場所（Artifact Registry）"
if ! gcloud artifacts repositories describe yamon --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create yamon --repository-format=docker --location="$REGION" \
    --description="やもんサイトの API"
fi
# 無料枠（0.5GB）に収まるよう、新しい3つだけを残し、ほかは1日たったら消す
policy=$(mktemp)
cat >"$policy" <<'JSON'
[
  {"name": "keep-recent", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}},
  {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"tagState": "ANY", "olderThan": "86400s"}}
]
JSON
gcloud artifacts repositories set-cleanup-policies yamon --location="$REGION" --policy="$policy" --no-dry-run >/dev/null
rm -f "$policy"

echo "== 3. サービスアカウント"
create_sa() {
  if ! gcloud iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$1" --display-name="$2"
  fi
}
create_sa yamon-api-runtime "やもんサイト API（Cloud Run で動く）"
create_sa github-deployer "GitHub Actions（API のデプロイ）"
# デプロイ用：Cloud Run の作成・更新と「誰でも呼べる」設定（--no-invoker-iam-check）、イメージの push、実行用アカウントの指定
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOYER_SA}" \
  --role=roles/run.admin --condition=None >/dev/null
gcloud artifacts repositories add-iam-policy-binding yamon --location="$REGION" \
  --member="serviceAccount:${DEPLOYER_SA}" --role=roles/artifactregistry.writer >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOYER_SA}" --role=roles/iam.serviceAccountUser >/dev/null

echo "== 4. GitHub Actions からのログイン（Workload Identity 連携。鍵を作らない）"
if ! gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
fi
if ! gcloud iam workload-identity-pools providers describe yamon-site --location=global \
  --workload-identity-pool=github >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc yamon-site --location=global \
    --workload-identity-pool=github --display-name="yamon-site" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.sub == '${GITHUB_SUBJECT}'"
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/subject/${GITHUB_SUBJECT}" \
  >/dev/null

echo "== 5. Secret Manager"
# 値を1つ登録し、実行用のアカウントだけが読めるようにする。前の版は消す（無料枠は有効な版が6つまで）
store_secret() {
  local name=$1 value=$2
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
    for old in $(gcloud secrets versions list "$name" --filter='state=ENABLED' --sort-by=~createTime \
      --format='value(name.basename())' | tail -n +2); do
      gcloud secrets versions destroy "$old" --secret="$name" --quiet >/dev/null
    done
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- \
      --replication-policy=user-managed --locations="$REGION" >/dev/null
  fi
  gcloud secrets add-iam-policy-binding "$name" --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
  echo "  $name を登録しました"
}
# 作り済みなら、上書きするか聞く（y 以外はそのまま）
should_write() {
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    local answer
    read -rp "  $1 は登録済みです。上書きしますか [y/N]: " answer
    [ "$answer" = "y" ]
  fi
}
ask_secret() {
  local name=$1 prompt=$2 value
  should_write "$name" || { echo "  $name はそのまま"; return; }
  read -rsp "  ${prompt}（入力は表示されません）: " value
  echo
  if [ -z "$value" ]; then echo "  空なので $name を登録しませんでした"; return; fi
  store_secret "$name" "$value"
}
generated=""
generate_secret() {
  local name=$1 value
  should_write "$name" || { echo "  $name はそのまま"; return; }
  value=$(openssl rand -hex 32)
  store_secret "$name" "$value"
  generated="${generated}  ${name}: ${value}\n"
}

ask_secret yamon-database-url "Neon の接続文字列（postgresql://...?sslmode=require）"
ask_secret yamon-smtp-pass "サークルの Gmail のアプリパスワード（16文字、空白なし）"
ask_secret yamon-github-map-data-token "地図データ更新用の GitHub の fine-grained token"
generate_secret yamon-proxy-secret
generate_secret yamon-setup-token

echo
echo "== 完了。次を GitHub の Variables に登録する（docs/DEPLOY_API.md の手順5）"
echo "  GCP_PROJECT_ID: ${PROJECT_ID}"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/yamon-site"
echo "  GCP_SERVICE_ACCOUNT: ${DEPLOYER_SA}"
if [ -n "$generated" ]; then
  echo
  echo "== 作った秘密の値（この画面にだけ表示する。使い終わったら clear で消す）"
  echo "  yamon-proxy-secret は Cloudflare の Worker の Secret（PROXY_SECRET）に、"
  echo "  yamon-setup-token は最初の管理者の登録（/setup）に使う"
  printf '%b' "$generated"
fi
