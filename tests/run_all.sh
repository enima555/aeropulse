#!/usr/bin/env bash
# Lance tous les tests sur une base PostgreSQL locale jetable.
# Prérequis : PostgreSQL 15+ (initdb, pg_ctl, psql), Node 22+, et pour le test navigateur : npm i -D playwright && npx playwright install chromium
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=${PGBIN:-$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}
DIR=$(mktemp -d)
"$PGBIN/initdb" -D "$DIR/data" -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -p 55433 -c listen_addresses=" -l "$DIR/log" start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DIR/data" stop >/dev/null; rm -rf "$DIR"' EXIT
export PGHOST=$DIR PGPORT=55433 PGUSER=$(whoami) PGDATABASE=aeropulse
createdb aeropulse
for f in tests/local_bootstrap.sql supabase/migrations/*_reference.sql tests/airports_seed.sql supabase/migrations/*_tenancy_flights.sql supabase/migrations/*_kpi.sql supabase/migrations/*_airports_tz_curfew.sql; do
  psql -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done   # les migrations Vault / pg_cron / pg_net ne s'appliquent que sur Supabase
echo "== Tests unitaires"; node --experimental-strip-types --no-warnings --test tests/unit.test.mjs
echo "== Tests base de données"; node --experimental-strip-types --no-warnings --test tests/db.test.mjs
if node -e "require.resolve('playwright')" 2>/dev/null || [ -d /opt/npm-tools/node_modules/playwright ]; then
  echo "== Test navigateur"
  node --experimental-strip-types --no-warnings tests/e2e/make_fixture.mjs
  EXPECTED_KPI=$(psql -X -q -A -t -c "select kpi_summary('11111111-1111-1111-1111-111111111111','LFPO','2026-10-02','2026-10-02T18:00:00+02:00')") node tests/e2e/browser.test.mjs "$DIR"
fi
