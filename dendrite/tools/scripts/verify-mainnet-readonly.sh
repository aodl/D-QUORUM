#!/bin/sh
set -eu

production_id=hp4av-oiaaa-aaaar-qcaha-cai
: "${DENDRITE_CANISTER_ID:?DENDRITE_CANISTER_ID is required}"
[ "$DENDRITE_CANISTER_ID" = "$production_id" ] || { echo "canister-ID mismatch" >&2; exit 1; }
[ -f Cargo.lock ] && [ -f icp.yaml ] || { echo "run from the repository root" >&2; exit 1; }
mapping=$(sed -n 's/.*"dendrite":[[:space:]]*"\([^"]*\)".*/\1/p' .icp/data/mappings/ic.ids.json)
[ "$mapping" = "$production_id" ] || { echo "mapping mismatch" >&2; exit 1; }
tools/scripts/verify-release-artifacts.sh

resolved=$(icp canister status dendrite -e ic --id-only)
[ "$resolved" = "$production_id" ] || { echo "resolved canister-ID mismatch" >&2; exit 1; }
status=$(icp canister status dendrite -e ic --json)
printf '%s\n' "$status"
icp canister settings show dendrite -e ic

local_hash=$(sha256sum dist/release/dendrite.wasm | cut -d ' ' -f 1)
printf '%s\n' "$status" | grep -qi "$local_hash" ||
  { echo "installed module hash does not equal raw release Wasm SHA-256" >&2; exit 1; }

origin=https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io
headers=$(mktemp)
body=$(mktemp)
trap 'find "$headers" "$body" -type f -delete' EXIT HUP INT TERM
for path in / /asset-manifest.json /.well-known/ii-alternative-origins; do
  curl --fail --silent --show-error --max-redirs 0 -D "$headers" -o "$body" "$origin$path"
  grep -Eiq '^HTTP/[0-9.]+ 200([[:space:]]|$)' "$headers"
  grep -Eiq '^IC-Certificate:' "$headers"
  grep -Eiq '^Cross-Origin-Opener-Policy:[[:space:]]*same-origin-allow-popups' "$headers"
  grep -Eiq '^Content-Security-Policy:' "$headers"
  grep -Eiq '^X-Content-Type-Options:[[:space:]]*nosniff' "$headers"
  case "$path" in
    /) grep -Eiq '^Content-Type:[[:space:]]*text/html' "$headers" ;;
    /asset-manifest.json) grep -Eiq '^Content-Type:[[:space:]]*application/json' "$headers" ;;
    /.well-known/ii-alternative-origins)
      grep -Eiq '^Content-Type:[[:space:]]*application/json' "$headers"
      grep -Eiq '^Access-Control-Allow-Origin:[[:space:]]*\\*' "$headers"
      [ "$(cat "$body")" = '{"alternativeOrigins":[]}' ]
      ;;
  esac
done

manifest=$(mktemp)
trap 'find "$headers" "$body" "$manifest" -type f -delete' EXIT HUP INT TERM
curl --fail --silent --show-error "$origin/asset-manifest.json" -o "$manifest"
for asset in $(sed -n 's/.*"[^"]*":[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$manifest"); do
  curl --fail --silent --show-error --max-redirs 0 -o /dev/null "$origin$asset"
done

if [ -n "${DENDRITE_SMOKE_NEURON_ID:-}" ]; then
  printf '%s\n' "$DENDRITE_SMOKE_NEURON_ID" | grep -Eq '^[1-9][0-9]*$' ||
    { echo "DENDRITE_SMOKE_NEURON_ID must be canonical decimal" >&2; exit 1; }
  icp canister call dendrite check_neuron "($DENDRITE_SMOKE_NEURON_ID : nat64)" -e ic
fi
echo "read-only mainnet verification passed"
