#!/usr/bin/env bash
# Runs the whole Stage 1-3 check sequence. Lives in backend/ (next to package.json). Run it from anywhere:
#   bash run-checks.sh                       migration + deps + backend + diagnose
#   bash run-checks.sh --photo ./me.jpg      also runs the real Gemini call (needs GEMINI_API_KEY in backend/.env)
#   bash run-checks.sh --skip-client         skip client lint/build
# Optional: PG_CONTAINER=name bash run-checks.sh   (default container name: fitcheck-pg)
set -u
BACK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../backend
ROOT="$(dirname "$BACK")"                               # project root (contains backend/ and client/)
cd "$BACK" || exit 1
PG="${PG_CONTAINER:-fitcheck-pg}"
fail() { echo -e "\n\033[31mSTOP:\033[0m $1"; exit 1; }

echo "== 0. Layout check (backend: $BACK)"
[ -f "$BACK/package.json" ] && [ -f "$BACK/src/server.js" ] || fail "run-checks.sh must be inside the backend/ folder."
[ -d "$ROOT/client/src" ] || fail "expected client/ next to backend/ (looked in $ROOT)."
[ -f "$ROOT/schema-history/002_fit_analyses.sql" ] || fail "schema-history/002_fit_analyses.sql is missing (Stage 1 file)."
[ -f src/routes/fits.js ] || fail "backend/src/routes/fits.js is missing (Stage 1 file)."
[ -f scripts/diagnose.js ] || fail "backend/scripts/diagnose.js is missing (Stage 3 file)."
[ -f scripts/verify.js ] || fail "backend/scripts/verify.js is missing (Stage 3 file)."
grep -q '^DATABASE_URL=.*localhost' .env 2>/dev/null || echo "   WARN: backend/.env DATABASE_URL does not point at localhost. Tests will hit that database instead (the throwaway verify_* users are deleted afterwards)."
podman ps --format '{{.Names}}' | grep -qx "$PG" || fail "container '$PG' is not running. Start it: podman start $PG"

echo "== 1. Apply 002 migration (safe to re-run)"
podman exec -i "$PG" psql -U postgres -d tsdb < "$ROOT/schema-history/002_fit_analyses.sql" || fail "migration failed."

echo "== 2. Install dependencies"
npm install --silent || fail "backend npm install failed."
(cd "$ROOT/client" && npm install --silent) || fail "client npm install failed."

echo "== 3. Backend"
STARTED=0
if curl -s -m 3 localhost:4000/api/health >/dev/null; then
  echo "   Using the backend already running on :4000"
else
  node src/server.js > "$BACK/server.log" 2>&1 &
  SERVER_PID=$!; STARTED=1
  trap '[ "$STARTED" = 1 ] && kill $SERVER_PID 2>/dev/null' EXIT
  for i in $(seq 1 20); do curl -s -m 2 localhost:4000/api/health >/dev/null && break; sleep 1; done
  curl -s -m 2 localhost:4000/api/health >/dev/null || { tail -20 "$BACK/server.log"; fail "backend did not start. Log above (also in backend/server.log)."; }
  echo "   Started backend (pid $SERVER_PID, log: backend/server.log)"
fi

echo "== 4. Diagnose"
node scripts/diagnose.js "$@"
CODE=$?
[ "$STARTED" = 1 ] && echo "   (stopping the backend I started)"
exit $CODE