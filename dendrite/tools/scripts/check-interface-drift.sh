#!/bin/sh
set -eu

revision=d55a0f4d4edfabe49d8fd543aff473084cb741f2
base="https://raw.githubusercontent.com/dfinity/ic/$revision"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

curl --fail --silent --show-error \
  "$base/rs/nns/governance/canister/governance.did" > "$tmp_dir/governance.did"
curl --fail --silent --show-error \
  "$base/rs/types/management_canister_types/src/lib.rs" > "$tmp_dir/management.rs"

# Candid service subtyping structurally proves every method-specific request and
# response in our consumer subset remains wire-compatible with the official API.
didc check "$tmp_dir/governance.did" candid/nns-governance/governance.subset.did
didc check "$tmp_dir/governance.did" candid/nns-governance/governance-transaction.subset.did

# Preliminary browser analysis has a distinct generated query-only actor. It
# retains the query annotation and must never acquire transaction methods.
tools/scripts/generate-governance-read-idl.sh \
  candid/nns-governance/governance.subset.did \
  "$tmp_dir/generated-governance-read-idl.js"
cmp "$tmp_dir/generated-governance-read-idl.js" \
  src/declarations/nns-governance-read/nns-governance-read.did.js
grep -q "\['query'\]" src/declarations/nns-governance-read/nns-governance-read.did.js
if grep -Eq 'manage_neuron|list_proposals|get_network_economics_parameters' \
  src/declarations/nns-governance-read/nns-governance-read.did.js; then
  echo 'mutation or transaction read entered the anonymous Governance declaration' >&2
  exit 1
fi

# The reviewed transaction Candid is the sole production actor type source. The
# generator performs one explicit transformation: replicated reads lose `query`.
tools/scripts/generate-transaction-idl.sh \
  candid/nns-governance/governance-transaction.subset.did \
  "$tmp_dir/generated-transaction-idl.js"
cmp "$tmp_dir/generated-transaction-idl.js" src/declarations/nns-governance/nns-governance.did.js
if grep -q "\['query'\]" src/declarations/nns-governance/nns-governance.did.js; then
  echo 'replicated-read query annotation remained in production transaction IDL' >&2
  exit 1
fi
sed 's/cached_neuron_stake_e8s : nat64/cached_neuron_stake_e8s : nat32/' \
  candid/nns-governance/governance-transaction.subset.did > "$tmp_dir/changed-consumed-field.did"
tools/scripts/generate-transaction-idl.sh "$tmp_dir/changed-consumed-field.did" "$tmp_dir/changed-idl.js"
if cmp -s "$tmp_dir/changed-idl.js" src/declarations/nns-governance/nns-governance.did.js; then
  echo 'required browser-consumed field change did not alter generated transaction IDL' >&2
  exit 1
fi

awk '
  /^type ManageNeuronCommandRequest = variant/ { inside = 1; next }
  inside && /^};/ { exit }
  inside && /^[[:space:]]*[A-Za-z]/ { line = $0; sub(/^[[:space:]]*/, "", line); sub(/[[:space:]]*:.*/, "", line); print line }
' "$tmp_dir/governance.did" | sort > "$tmp_dir/upstream-commands"
awk '{ print $1 }' candid/nns-governance/command-capabilities.txt | sort > "$tmp_dir/local-commands"
cmp "$tmp_dir/upstream-commands" "$tmp_dir/local-commands"
awk '
  /^type Command_1 = variant/ { inside = 1; next }
  inside && /^};/ { exit }
  inside && /^[[:space:]]*[A-Za-z]/ { line = $0; sub(/^[[:space:]]*/, "", line); sub(/[[:space:]]*:.*/, "", line); print line }
' "$tmp_dir/governance.did" | sort > "$tmp_dir/upstream-responses"
sort candid/nns-governance/response-capabilities.txt > "$tmp_dir/local-responses"
cmp "$tmp_dir/upstream-responses" "$tmp_dir/local-responses"

# The management interface is documented as Candid in the official Rust source.
# Extract those two authoritative code blocks and compare them structurally.
awk '
  /`CandidType` for `CanisterInfoRequest`/ { wanted = 1; next }
  wanted && /```text/ { in_block = 1; next }
  in_block && /```/ { exit }
  in_block { print }
' "$tmp_dir/management.rs" | sed 's|^/// ||' > "$tmp_dir/request.did"
awk '
  /pub struct CanisterInfoRequest/ { request_seen = 1 }
  request_seen && /`CandidType` for `CanisterInfoRequest`/ { wanted = 1; next }
  wanted && /```text/ { in_block = 1; next }
  in_block && /```/ { exit }
  in_block { print }
' "$tmp_dir/management.rs" | sed 's|^/// ||' > "$tmp_dir/response.did"

{
  printf 'type CanisterInfoRequest = '
  cat "$tmp_dir/request.did"
  printf ';\ntype change = reserved;\ntype CanisterInfoResponse = '
  sed 's/vec change/vec reserved/' "$tmp_dir/response.did"
  printf ';\nservice : { canister_info : (CanisterInfoRequest) -> (CanisterInfoResponse) };\n'
} > "$tmp_dir/management.did"
didc check --strict "$tmp_dir/management.did" candid/management/canister-info.subset.did

# These fixtures intentionally change a required wire type. A checker that
# accepts either fixture is not a semantic drift checker.
if didc check "$tmp_dir/governance.did" tools/interface-fixtures/governance-incompatible.did >/dev/null 2>&1; then
  echo 'incompatible Governance fixture unexpectedly passed' >&2
  exit 1
fi
if didc check "$tmp_dir/governance.did" tools/interface-fixtures/governance-transaction-incompatible.did >/dev/null 2>&1; then
  echo 'incompatible Governance transaction fixture unexpectedly passed' >&2
  exit 1
fi
if didc check --strict "$tmp_dir/management.did" tools/interface-fixtures/management-incompatible.did >/dev/null 2>&1; then
  echo 'incompatible management fixture unexpectedly passed' >&2
  exit 1
fi

echo "semantic interface compatibility passed at dfinity/ic@$revision"
