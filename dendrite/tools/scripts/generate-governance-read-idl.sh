#!/bin/sh
set -eu

input=${1:-candid/nns-governance/governance.subset.did}
output=${2:-src/declarations/nns-governance-read/nns-governance-read.did.js}
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT HUP INT TERM

didc bind -t js "$input" |
  sed '/^export const init =/d' > "$temporary"
{
  echo '// Generated deterministically from candid/nns-governance/governance.subset.did.'
  echo '// Anonymous live analysis exposes only explicit public Governance queries.'
  cat "$temporary"
} > "$output"
