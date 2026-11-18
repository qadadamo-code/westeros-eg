#!/usr/bin/env bash
# Applies every migration and the Westeros seed to a throwaway database and runs finance_test.sql.
#   PGHOST=… PGPORT=… PGUSER=postgres supabase/tests/finance.sh   → FINANCE_DB_TESTS_PASSED
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="westeros_finance_$$"
SEED="$(mktemp)"
createdb "$DB"
trap 'dropdb --if-exists "$DB"; rm -f "$SEED"' EXIT
WESTEROS_PASSWORD=test-only npx tsx scripts/gen-westeros-seed.ts "$SEED" >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/supabase_stubs.sql
export PGOPTIONS="-c client_min_messages=warning"
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$SEED" 2>/dev/null
# a second run of the finance migration changes nothing and does not fail
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/migrations/0040_finance.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/finance_test.sql
