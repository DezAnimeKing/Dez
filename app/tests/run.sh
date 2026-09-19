#!/usr/bin/env bash
# Serves the app on a spare port and runs the three browser suites against it.
#
#   npm i -D playwright && npx playwright install chromium
#   ./tests/run.sh [smoke|deep|mobile]
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${PORT:-8899}"
export BASE="http://127.0.0.1:${PORT}"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1

suites=("$@")
if [ ${#suites[@]} -eq 0 ]; then suites=(smoke deep mobile); fi

status=0
for suite in "${suites[@]}"; do
  echo "── ${suite} ──────────────────────────────"
  node "tests/${suite}.mjs" || status=1
done
exit $status
