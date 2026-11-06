#!/bin/sh
set -eu

tree=$(cargo tree --locked -p dendrite --edges normal,build)
for package in pocket-ic backoff instant; do
    if printf '%s\n' "$tree" | grep -Eq "(^|[[:space:]├└─])${package} v"; then
        echo "$package is reachable from the production Dendrite dependency tree" >&2
        exit 1
    fi
done

echo "production tree excludes pocket-ic, backoff, and instant"
echo "serde_cbor production path (official HTTP certification libraries):"
cargo tree --locked -p dendrite --edges normal,build -i serde_cbor
