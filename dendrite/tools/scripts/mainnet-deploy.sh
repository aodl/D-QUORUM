#!/bin/sh
set -eu

production_id=hp4av-oiaaa-aaaar-qcaha-cai
production_origin=https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io
production_alternatives='{"alternativeOrigins":[]}'
canonical_wasm_hash=74f6090a729fa467908985c8ef8adc415e237fdf2e6eda8fa7d6a68a0aade972
mode=${1:-}

case "$mode" in
  dry-run|install|upgrade) ;;
  reinstall) echo "reinstall is unsupported" >&2; exit 1 ;;
  *) echo "usage: tools/scripts/mainnet-deploy.sh <dry-run|install|upgrade>" >&2; exit 1 ;;
esac

: "${DENDRITE_CANISTER_ID:?DENDRITE_CANISTER_ID is required}"
: "${DENDRITE_DERIVATION_ORIGIN:?DENDRITE_DERIVATION_ORIGIN is required}"
: "${DENDRITE_ALTERNATIVE_ORIGINS_JSON:?DENDRITE_ALTERNATIVE_ORIGINS_JSON is required}"
: "${DENDRITE_CONFIRM_MAINNET:?DENDRITE_CONFIRM_MAINNET is required}"
[ "$DENDRITE_CANISTER_ID" = "$production_id" ] || { echo "canister-ID mismatch" >&2; exit 1; }
[ "$DENDRITE_CONFIRM_MAINNET" = "$production_id" ] || { echo "wrong mainnet confirmation" >&2; exit 1; }
[ "$DENDRITE_DERIVATION_ORIGIN" = "$production_origin" ] || { echo "wrong derivation origin" >&2; exit 1; }
[ "$DENDRITE_ALTERNATIVE_ORIGINS_JSON" = "$production_alternatives" ] || { echo "wrong alternative-origin document" >&2; exit 1; }
[ -f Cargo.lock ] && [ -f icp.yaml ] && [ -d .git ] || { echo "unexpected project root" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "dirty Git worktree" >&2; exit 1; }
command -v icp >/dev/null
required_icp_version=1.2.0
icp_version_output=$(icp --version 2>&1)
[ "$icp_version_output" = "icp $required_icp_version" ] || {
  printf 'icp-cli %s is required; found: %s\n' \
    "$required_icp_version" \
    "$icp_version_output" >&2
  exit 1
}

echo "Git commit: $(git rev-parse HEAD)"
echo "icp-cli executable: $(command -v icp)"
echo "icp-cli version: $icp_version_output"
echo "icp-cli identity: $(icp identity default)"
echo "icp-cli principal: $(icp identity principal)"

mapping=$(sed -n 's/.*"dendrite":[[:space:]]*"\([^"]*\)".*/\1/p' .icp/data/mappings/ic.ids.json)
[ "$mapping" = "$production_id" ] || { echo "missing or incorrect .icp/data mapping" >&2; exit 1; }
resolved=$(icp canister status dendrite -e ic --id-only)
[ "$resolved" = "$production_id" ] || { echo "resolved canister-ID mismatch: $resolved" >&2; exit 1; }
tools/scripts/verify-release-artifacts.sh
wasm_hash=$(sha256sum dist/release/dendrite.wasm | cut -d ' ' -f 1)
[ "$wasm_hash" = "$canonical_wasm_hash" ] ||
  { echo "release is not the verified canonical Docker Wasm" >&2; exit 1; }
echo "Raw Wasm SHA-256: $wasm_hash"

status_json=$(icp canister status dendrite -e ic --json)
printf '%s\n' "$status_json"
if ! settings_output=$(icp canister settings show dendrite -e ic 2>&1); then
  [ "$mode" = dry-run ] || {
    printf '%s\n' "$settings_output" >&2
    echo "controller-only settings preflight failed" >&2
    exit 1
  }
  printf '%s\n' "Controller-only settings unavailable to the automated dry-run (expected for limited or anonymous identity)."
  printf '%s\n' "$settings_output"
else
  printf '%s\n' "$settings_output"
fi
module_present=$(printf '%s\n' "$status_json" | grep -Eiq '"module_hash"[[:space:]]*:[[:space:]]*(null|\\[\\])' && printf no || printf yes)

requested_mode=$mode
[ "$mode" = dry-run ] && requested_mode=${DENDRITE_DRY_RUN_MODE:-install}
case "$requested_mode" in install|upgrade) ;; *) echo "DENDRITE_DRY_RUN_MODE must be install or upgrade" >&2; exit 1 ;; esac
[ "$requested_mode" != install ] || [ "$module_present" = no ] || { echo "install rejected: code is already installed" >&2; exit 1; }
[ "$requested_mode" != upgrade ] || [ "$module_present" = yes ] || { echo "upgrade rejected: no module is installed" >&2; exit 1; }

command_text="icp canister install dendrite --environment ic --mode $requested_mode --wasm dist/release/dendrite.wasm"
echo "Intended lifecycle command: $command_text"
[ "$mode" = dry-run ] && { echo "dry-run complete; no write performed"; exit 0; }

printf 'Type the production canister ID to continue: ' >&2
IFS= read -r confirmation
[ "$confirmation" = "$production_id" ] || { echo "interactive confirmation rejected" >&2; exit 1; }
icp canister install dendrite --environment ic --mode "$requested_mode" --wasm dist/release/dendrite.wasm
