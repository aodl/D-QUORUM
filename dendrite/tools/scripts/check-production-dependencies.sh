#!/bin/sh
set -eu

for component in dendrite dendrite-bootstrap; do
  tree=$(cargo tree --locked -p "$component" --edges normal,build)
  for package in pocket-ic backoff instant; do
    if printf '%s\n' "$tree" | grep -Eq "(^|[[:space:]├└─])${package} v"; then
        echo "$package is reachable from the production $component dependency tree" >&2
        exit 1
    fi
  done
  echo "$component production tree excludes pocket-ic, backoff, and instant"
done

echo "serde_cbor production path (official HTTP certification libraries):"
cargo tree --locked -p dendrite --edges normal,build -i serde_cbor
