#!/bin/sh
set -eu

input=${1:-candid/nns-governance/governance-transaction.subset.did}
output=${2:-src/declarations/nns-governance/nns-governance.did.js}
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT HUP INT TERM

didc bind -t js "$input" |
  sed "s/\['query'\]/[]/g; /^export const init =/d" > "$temporary"
{
  echo '// Generated deterministically from candid/nns-governance/governance-transaction.subset.did.'
  echo '// Replicated reads intentionally transform every query annotation to an update annotation.'
  cat "$temporary"
} > "$output"
