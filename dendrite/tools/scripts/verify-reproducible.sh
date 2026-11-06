#!/bin/sh
set -eu
reference_dir=$(mktemp -d)
trap 'rm -rf "$reference_dir"' EXIT HUP INT TERM
tools/scripts/build-reproducible.sh
cp dist/dendrite.wasm dist/frontend.sha256 dist/asset-manifest.json dist/build-configuration.txt "$reference_dir/"
cargo clean
tools/scripts/build-reproducible.sh
cmp "$reference_dir/dendrite.wasm" dist/dendrite.wasm
cmp "$reference_dir/frontend.sha256" dist/frontend.sha256
cmp "$reference_dir/asset-manifest.json" dist/asset-manifest.json
cmp "$reference_dir/build-configuration.txt" dist/build-configuration.txt
sha256sum "$reference_dir/dendrite.wasm" dist/dendrite.wasm
sha256sum "$reference_dir/frontend.sha256" dist/frontend.sha256
echo 'two local clean builds are byte-identical'
