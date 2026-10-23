#!/usr/bin/env bash
# DATABASE_URL の DB を pg_dump で1つのファイルに書き出す（custom 形式・圧縮済み、D49、docs/BACKUP.md）。
#   DATABASE_URL=postgresql://... bash scripts/db-backup/dump.sh <出力ファイル>
# pg_dump は本番（Neon）と同じメジャー版の公式イメージ（postgres:17）で動かす。Docker が要る
set -euo pipefail

out="${1:?使い方: bash scripts/db-backup/dump.sh <出力ファイル>}"
: "${DATABASE_URL:?DATABASE_URL を指定してください}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"
dir=$(cd "$(dirname "$out")" && pwd)
name=$(basename "$out")

# 所有者と権限は書き出さない（戻す先の DB のユーザー名が違っても戻せるように）
docker run --rm --network host -e DATABASE_URL -v "$dir:/backup" "$PG_IMAGE" \
  sh -c 'pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-owner --no-privileges --file="/backup/$1"' \
  sh "$name"
# 書き出したファイルの目次が読めることを確かめる（壊れたファイルを置かない）
# pg_restore が失敗したら（set -e で）ここで止まる。grep の「0件」だけを許す
list=$(docker run --rm -v "$dir:/backup" "$PG_IMAGE" pg_restore --list "/backup/$name")
tables=$(printf '%s\n' "$list" | grep -c ' TABLE DATA ' || true)
if [ "$tables" -eq 0 ]; then
  echo "書き出したファイルに表のデータがありません：$out" >&2
  exit 1
fi
echo "書き出した：$out（表 ${tables}個、$(wc -c <"$out") バイト）"
