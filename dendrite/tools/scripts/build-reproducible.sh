#!/bin/sh
set -eu
: "${DENDRITE_CANISTER_ID:?DENDRITE_CANISTER_ID is required}"
: "${DENDRITE_DERIVATION_ORIGIN:?DENDRITE_DERIVATION_ORIGIN is required}"
export DENDRITE_API_HOST=${DENDRITE_API_HOST:-https://icp-api.io}
export DENDRITE_BUILD_MODE=production
export DENDRITE_FETCH_ROOT_KEY=false
export SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH:-0}
npm ci --ignore-scripts
npm run build
cargo build --locked --release --target wasm32-unknown-unknown -p dendrite
mkdir -p dist
cp target/wasm32-unknown-unknown/release/dendrite.wasm dist/dendrite.wasm
cp canisters/dendrite/public/asset-manifest.json dist/asset-manifest.json
{
  echo "DENDRITE_CANISTER_ID=$DENDRITE_CANISTER_ID"
  echo "DENDRITE_API_HOST=$DENDRITE_API_HOST"
  echo "DENDRITE_FETCH_ROOT_KEY=$DENDRITE_FETCH_ROOT_KEY"
  echo "DENDRITE_DERIVATION_ORIGIN=$DENDRITE_DERIVATION_ORIGIN"
  echo "DENDRITE_ALTERNATIVE_ORIGINS_JSON=${DENDRITE_ALTERNATIVE_ORIGINS_JSON:-[]}"
  echo "DENDRITE_IDENTITY_PROVIDER=${DENDRITE_IDENTITY_PROVIDER:-https://id.ai/authorize}"
  echo "DENDRITE_AUTHENTICATION_DELEGATION_TTL_NS=28800000000000"
} > dist/build-configuration.txt
find canisters/dendrite/public -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > dist/frontend.sha256
sha256sum dist/dendrite.wasm dist/frontend.sha256 dist/asset-manifest.json dist/build-configuration.txt > dist/artifacts.sha256
