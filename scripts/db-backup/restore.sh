#!/usr/bin/env bash
# dump.sh で書き出したファイルを、TARGET_DATABASE_URL の空の DB に戻す（D49、docs/BACKUP.md）。
#   TARGET_DATABASE_URL=postgresql://... bash scripts/db-backup/restore.sh <ファイル>
# 1つのトランザクションで戻し、途中で失敗したら何も入れない。使っている本番の DB には直接戻さない
set -euo pipefail

file="${1:?使い方: bash scripts/db-backup/restore.sh <ファイル>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL（戻す先の空の DB）を指定してください}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"
dir=$(cd "$(dirname "$file")" && pwd)
name=$(basename "$file")

docker run --rm --network host -e TARGET_DATABASE_URL -v "$dir:/backup" "$PG_IMAGE" \
  sh -c 'pg_restore --dbname="$TARGET_DATABASE_URL" --no-owner --no-privileges --exit-on-error --single-transaction "/backup/$1"' \
  sh "$name"
echo "戻した：$file"
