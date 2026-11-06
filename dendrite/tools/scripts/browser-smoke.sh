#!/bin/sh
set -eu

frontend=${1:-dist/release/frontend}
[ -f "$frontend/index.html" ] || {
  echo "usage: tools/scripts/browser-smoke.sh [built-frontend-directory]" >&2
  exit 1
}
image='ghcr.io/puppeteer/puppeteer:25.16.0@sha256:956a72e3d523c76606efaad23392fbe33950370189f749715222c7427f57392b'
evidence=${DENDRITE_BROWSER_EVIDENCE_DIR:-dist/browser-qualification}
repository=$(pwd)
case "$frontend" in /*) frontend_absolute=$frontend;; *) frontend_absolute=$repository/$frontend;; esac
case "$evidence" in /*) evidence_absolute=$evidence;; *) evidence_absolute=$repository/$evidence;; esac

temporary=$(mktemp -d)
server_pid=
trap '
  [ -z "$server_pid" ] || kill "$server_pid" 2>/dev/null || true
  find "$temporary" -type f -delete
  find "$temporary" -depth -type d -empty -delete
' EXIT HUP INT TERM

qualification_frontend=$temporary/frontend
mkdir -p "$qualification_frontend/test-src"
cp -R "$frontend_absolute/." "$qualification_frontend/"
cp canisters/dendrite/web/src/*.js canisters/dendrite/web/src/styles.css "$qualification_frontend/test-src/"
cp canisters/dendrite/web/test/browser-failure-fixture.html "$qualification_frontend/test-failure.html"

python3 -m http.server 4173 --bind 127.0.0.1 --directory "$qualification_frontend" \
  >"$temporary/server.log" 2>&1 &
server_pid=$!
for _attempt in 1 2 3 4 5; do
  curl --fail --silent http://127.0.0.1:4173/ >/dev/null && break
  sleep 1
done
curl --fail --silent http://127.0.0.1:4173/ >/dev/null
mkdir -p "$evidence_absolute"
chmod 0777 "$evidence_absolute"
docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  --name "${DENDRITE_BROWSER_CONTAINER_NAME:-dendrite-anonymous-$$}" \
  -e XDG_CONFIG_HOME=/tmp/dendrite-anonymous-config \
  -e XDG_CACHE_HOME=/tmp/dendrite-anonymous-cache \
  -e DENDRITE_BROWSER_FRONTEND=/frontend \
  -e DENDRITE_BROWSER_BASE_URL="${DENDRITE_BROWSER_BASE_URL:-http://127.0.0.1:4173}" \
  -e DENDRITE_BROWSER_LOCAL_WORLD="${DENDRITE_BROWSER_LOCAL_WORLD:-false}" \
  -e DENDRITE_BROWSER_CANISTER_ID="${DENDRITE_BROWSER_CANISTER_ID:-}" \
  -e DENDRITE_BROWSER_EVIDENCE=/evidence \
  -e DENDRITE_BROWSER_IMAGE="$image" \
  -v "$repository:/workspace:ro" \
  -v "$(git rev-parse --show-toplevel):/integration:ro" \
  -v "$qualification_frontend:/frontend:ro" \
  -v "$evidence_absolute:/evidence" \
  -w /workspace \
  "$image" \
  node tools/scripts/browser-qualification.mjs
