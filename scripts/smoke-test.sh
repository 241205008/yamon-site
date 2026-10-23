#!/usr/bin/env bash
# 公開した本番（またはプレビュー）を外から確かめる（docs/SMOKE_TEST.md）。
#
#   bash scripts/smoke-test.sh                                     # 本番 https://yamon-site.yamonken.workers.dev
#   bash scripts/smoke-test.sh https://pr-59-yamon-site.yamonken.workers.dev --preview   # PR のプレビュー
#   CLOUD_RUN_URL=https://yamon-api-....run.app bash scripts/smoke-test.sh   # Cloud Run への直接のアクセスも確かめる
#   bash scripts/smoke-test.sh http://localhost:5173 --no-map      # 手元の開発環境（npm run dev）
#
# ログインはしない（パスワードや Secret を使わない）。画面での確認は docs/SMOKE_TEST.md のチェックリストで行う。
# 失敗が1つでもあれば終了コード 1。警告（地図データがまだない など）は失敗に数えない
set -uo pipefail

BASE="https://yamon-site.yamonken.workers.dev"
MODE=production
CHECK_MAP=1
for arg in "$@"; do
  case "$arg" in
    --preview) MODE=preview ;;
    --no-map) CHECK_MAP=0 ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    -*)
      echo "知らないオプション：$arg" >&2
      exit 2
      ;;
    *) BASE="${arg%/}" ;;
  esac
done
CLOUD_RUN_URL="${CLOUD_RUN_URL:-}"
CLOUD_RUN_URL="${CLOUD_RUN_URL%/}"

failures=0
warnings=0
pass() { echo "  OK    $1"; }
fail() {
  echo "  失敗  $1"
  failures=$((failures + 1))
}
warn() {
  echo "  警告  $1"
  warnings=$((warnings + 1))
}

body_file=$(mktemp)
header_file=$(mktemp)
trap 'rm -f "$body_file" "$header_file"' EXIT

# request <メソッド> <URL> [curl の引数...]：状態コードを STATUS に、本文を BODY に、かかった秒数を TIME に入れる
request() {
  local method=$1 url=$2
  shift 2
  local out
  out=$(curl -sS -X "$method" -o "$body_file" -D "$header_file" -w '%{http_code} %{time_total}' --max-time 60 "$@" "$url" 2>&1) ||
    out="000 0"
  STATUS=${out%% *}
  TIME=${out##* }
  BODY=$(cat "$body_file")
}
header() { grep -i "^$1:" "$header_file" | head -n 1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }
body_has() { printf '%s' "$BODY" | grep -q -- "$1"; }

echo "確かめる先：$BASE（$( [ "$MODE" = preview ] && echo 'プレビュー' || echo '本番')）"

echo "== 画面"
request GET "$BASE/"
if [ "$STATUS" = 200 ] && header content-type | grep -q text/html; then pass "トップが HTML を返す"; else fail "トップ：$STATUS"; fi
request GET "$BASE/event-detail/smoke-test"
if [ "$STATUS" = 200 ] && body_has '<div id="root"'; then
  pass "画面のパスを直接開いても index.html を返す（SPA）"
else
  fail "画面のパスの直接アクセス：$STATUS"
fi

echo "== API（Worker 経由）"
request GET "$BASE/api/health"
if [ "$MODE" = preview ]; then
  if [ "$STATUS" = 503 ] && body_has api_unavailable; then
    pass "プレビューは API につながらない（503 api_unavailable、D45）"
  else
    fail "プレビューの /api/health：$STATUS（503 api_unavailable のはず。本番の API につながっていないか確かめる）"
  fi
  request GET "$BASE/api/records"
  if [ "$STATUS" = 503 ]; then pass "プレビューの記録の API も 503"; else fail "プレビューの /api/records：$STATUS"; fi
else
  if [ "$STATUS" = 200 ] && body_has '"status":"ok"'; then
    pass "/api/health が通る（${TIME}秒。0台からの起動なら数秒かかる）"
  elif [ "$STATUS" = 503 ] && body_has api_unavailable; then
    fail "/api/health：503 api_unavailable。Worker の Secret（API_ORIGIN・PROXY_SECRET）が未登録（docs/DEPLOY_API.md の手順7）"
  elif [ "$STATUS" = 403 ]; then
    fail "/api/health：403。Worker の PROXY_SECRET と Secret Manager の yamon-proxy-secret が違う"
  else
    fail "/api/health：$STATUS $BODY"
  fi
  if [ "$(header x-content-type-options)" = nosniff ]; then pass "API の応答にセキュリティ用のヘッダーが付く"; else fail "x-content-type-options がない"; fi

  request GET "$BASE/api/records"
  if [ "$STATUS" = 401 ] && body_has unauthorized; then pass "ログインしていないと記録を読めない（401）"; else fail "未ログインの /api/records：$STATUS"; fi

  request POST "$BASE/api/auth/login" -H 'content-type: text/plain' --data 'email=a&password=b'
  if [ "$STATUS" = 415 ]; then pass "JSON 以外の POST を断る（CSRF 対策、D33）"; else fail "JSON 以外の POST：$STATUS（415 のはず）"; fi

  request GET "$BASE/api/no-such-path"
  if [ "$STATUS" = 404 ] && body_has not_found; then pass "ない API は JSON の 404"; else fail "ない API：$STATUS"; fi

  request GET "$BASE/api/setup"
  if [ "$STATUS" = 200 ]; then
    if body_has '"needed":false'; then
      pass "初回セットアップは済んでいる"
    elif body_has '"available":true'; then
      warn "初回セットアップがまだ（/setup で最初の管理者を登録する。docs/SMOKE_TEST.md の2）"
    else
      fail "初回セットアップが必要だが、SETUP_TOKEN がない（Secret Manager の yamon-setup-token）"
    fi
  else
    fail "/api/setup：$STATUS"
  fi
fi

if [ "$CHECK_MAP" = 1 ]; then
  echo "== 地図データ（R2、docs/MAP_DATA.md）"
  request GET "$BASE/map/survey-area.json"
  if [ "$STATUS" = 200 ] && body_has '"key"'; then
    pass "地図データの参照先を返す"
    request GET "$BASE/map/survey-area.pmtiles" -H 'Range: bytes=0-126'
    if [ "$STATUS" = 206 ]; then pass "地図データを Range で返す（206）"; else fail "地図データの Range：$STATUS"; fi
  elif [ "$STATUS" = 503 ]; then
    warn "地図データの保存先（R2）が未設定（503）。背景の地図だけが出ない（#25）"
  else
    fail "地図データの参照先：$STATUS"
  fi
fi

if [ -n "$CLOUD_RUN_URL" ]; then
  echo "== Cloud Run への直接のアクセス（D44）"
  request GET "$CLOUD_RUN_URL/api/health"
  if [ "$STATUS" = 403 ] && body_has forbidden; then pass "秘密のヘッダーなしは 403"; else fail "直接のアクセス：$STATUS（403 のはず）"; fi
  request GET "$CLOUD_RUN_URL/api/health" -H 'x-yamon-proxy-secret: wrong-value'
  if [ "$STATUS" = 403 ]; then pass "違う値のヘッダーも 403"; else fail "違う値のヘッダー：$STATUS（403 のはず）"; fi
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "失敗 ${failures}件・警告 ${warnings}件"
  exit 1
fi
echo "すべて通った（警告 ${warnings}件）"
