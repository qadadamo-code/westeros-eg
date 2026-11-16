#!/usr/bin/env bash
# Applies every migration that has not been applied yet, in file order, each in its own transaction, then the
# Westeros tenant seed once. What was applied is recorded in westeros_ops.applied, so re-running changes nothing.
#   SUPABASE_DB_URL=postgresql://... [SEED_FILE=/path/seed.sql] supabase/apply.sh
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
# This script belongs to the Westeros OS project only. Refuse the other projects of the same account.
case "$SUPABASE_DB_URL" in
  *beltcdliikepguiycjml* | *fxgljuswxeovwimfokml*)
    echo "This connection string points at another project. Nothing was changed." >&2
    exit 1
    ;;
esac
cd "$(dirname "$0")"
run() { psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
run -c "create schema if not exists westeros_ops" \
  -c "create table if not exists westeros_ops.applied (name text primary key, applied_at timestamptz not null default now())" \
  -c "revoke all on schema westeros_ops from public"
applied() { [ "$(run -At -c "select 1 from westeros_ops.applied where name = '$1'")" = "1" ]; }
apply() { # name, file
  if applied "$1"; then
    echo "skip   $1"
  else
    echo "apply  $1"
    run --single-transaction -f "$2" -c "insert into westeros_ops.applied (name) values ('$1')"
  fi
}
for f in migrations/*.sql; do apply "$(basename "$f" .sql)" "$f"; done
if [ -n "${SEED_FILE:-}" ]; then apply "seed-westeros-1" "$SEED_FILE"; fi
# tables added by a later migration join the change journal (0017_history.sql)
run -c "do \$\$ begin if to_regprocedure('public.track_changes()') is not null then perform public.track_changes(); end if; end \$\$"
echo "database is up to date"
