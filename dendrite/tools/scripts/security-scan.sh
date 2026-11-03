#!/bin/sh
set -eu
cargo audit
cargo deny check
tools/scripts/check-production-dependencies.sh
osv-scanner scan source -r .
npm audit --omit=dev
git grep -n -E '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|seed phrase|identity\.pem)' -- ':!tools/scripts/security-scan.sh' && { echo 'secret-pattern match' >&2; exit 1; } || true
tools/scripts/check-interface-drift.sh
