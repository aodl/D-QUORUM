#!/bin/sh
set -eu

frontend=${1:-dist/release/frontend}
[ -f "$frontend/index.html" ] || {
  echo "usage: tools/scripts/browser-smoke.sh [built-frontend-directory]" >&2
  exit 1
}
image='ghcr.io/puppeteer/puppeteer:24.36.0@sha256:60273620ab047d273d77f8535cd3adaffa9c138e3b38ba7934d8934a7b5d3c92'
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
  -e HOME=/tmp \
  -e DENDRITE_BROWSER_FRONTEND=/frontend \
  -e DENDRITE_BROWSER_EVIDENCE=/evidence \
  -e DENDRITE_BROWSER_IMAGE="$image" \
  -v "$repository:/workspace:ro" \
  -v "$qualification_frontend:/frontend:ro" \
  -v "$evidence_absolute:/evidence" \
  -w /workspace \
  "$image" \
  node tools/scripts/browser-qualification.mjs
