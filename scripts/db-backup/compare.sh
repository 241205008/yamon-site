#!/usr/bin/env bash
# 2つの DB の中身が同じかを、表ごとの行数と、全行をつないだ文字列の MD5 で比べる（D49、docs/BACKUP.md）。
#   bash scripts/db-backup/compare.sh <元の DB の URL> <戻した DB の URL>
# 同じなら終了コード 0、違えば差分を出して 1
set -euo pipefail

a="${1:?使い方: bash scripts/db-backup/compare.sh <URL1> <URL2>}"
b="${2:?使い方: bash scripts/db-backup/compare.sh <URL1> <URL2>}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"

# システム以外のすべての表（マイグレーションの記録 drizzle.__drizzle_migrations も含む）について
# 「スキーマ.表 行数 MD5」を1行ずつ出す
read -r -d '' query <<'SQL' || true
select format(
  'select %L || '' '' || count(*) || '' '' || coalesce(md5(string_agg(t::text, E''\n'' order by t::text)), ''-'') from %I.%I t',
  n.nspname || '.' || c.relname, n.nspname, c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_%'
order by n.nspname, c.relname
\gexec
SQL

summary() {
  printf '%s\n' "$query" | docker run --rm -i --network host -e URL="$1" "$PG_IMAGE" \
    sh -c 'psql "$URL" --no-psqlrc --quiet --tuples-only --no-align --set ON_ERROR_STOP=1' | sed '/^$/d'
}
left=$(summary "$a")
right=$(summary "$b")
if [ -z "$left" ]; then
  echo "元の DB に表がありません" >&2
  exit 1
fi
if [ "$left" != "$right" ]; then
  echo "中身が違います（< 元 / > 戻した方）：" >&2
  diff <(printf '%s\n' "$left") <(printf '%s\n' "$right") >&2 || true
  exit 1
fi
echo "中身が同じ：表 $(printf '%s\n' "$left" | wc -l)個"
printf '%s\n' "$left" | awk '{print "  " $1 " " $2 "行"}'
