#!/bin/sh
set -eu

production_id=hp4av-oiaaa-aaaar-qcaha-cai
production_origin=https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io
production_alternatives='{"alternativeOrigins":[]}'
production_api_host=https://icp-api.io
production_identity_provider=https://id.ai/authorize

: "${DENDRITE_CANISTER_ID:?DENDRITE_CANISTER_ID is required}"
: "${DENDRITE_DERIVATION_ORIGIN:?DENDRITE_DERIVATION_ORIGIN is required}"
: "${DENDRITE_ALTERNATIVE_ORIGINS_JSON:?DENDRITE_ALTERNATIVE_ORIGINS_JSON is required}"
: "${DENDRITE_API_HOST:?DENDRITE_API_HOST is required}"
: "${DENDRITE_IDENTITY_PROVIDER:?DENDRITE_IDENTITY_PROVIDER is required}"
: "${SOURCE_DATE_EPOCH:?SOURCE_DATE_EPOCH is required}"

[ "$DENDRITE_CANISTER_ID" = "$production_id" ] || { echo "DENDRITE_CANISTER_ID must equal $production_id" >&2; exit 1; }
[ "$DENDRITE_DERIVATION_ORIGIN" = "$production_origin" ] || { echo "DENDRITE_DERIVATION_ORIGIN must equal $production_origin" >&2; exit 1; }
[ "$DENDRITE_ALTERNATIVE_ORIGINS_JSON" = "$production_alternatives" ] || { echo "DENDRITE_ALTERNATIVE_ORIGINS_JSON must equal $production_alternatives" >&2; exit 1; }
[ "$DENDRITE_API_HOST" = "$production_api_host" ] || { echo "DENDRITE_API_HOST must equal $production_api_host" >&2; exit 1; }
[ "$DENDRITE_IDENTITY_PROVIDER" = "$production_identity_provider" ] || { echo "DENDRITE_IDENTITY_PROVIDER must equal $production_identity_provider" >&2; exit 1; }
[ "$SOURCE_DATE_EPOCH" = 0 ] || { echo "SOURCE_DATE_EPOCH must equal 0" >&2; exit 1; }
[ "${DENDRITE_FETCH_ROOT_KEY:-false}" = false ] || { echo "root-key fetching must be disabled" >&2; exit 1; }
[ -f Cargo.lock ] && [ -f Dockerfile.repro ] && [ -f icp.yaml ] || { echo "run from the repository root" >&2; exit 1; }
command -v docker >/dev/null
docker_context=${DOCKER_CONTEXT:-default}
buildx_builder=${BUILDX_BUILDER:-dendrite-canonical}
docker_version=$(docker --context "$docker_context" version 2>&1) || {
  printf '%s\n' "$docker_version" >&2
  exit 1
}
printf '%s\n' "$docker_version"
printf '%s\n' "$docker_version" | grep -q '^Server: Docker Engine' ||
  { echo "canonical release requires Docker Engine" >&2; exit 1; }
docker_endpoint=$(docker context inspect "$docker_context" --format '{{(index .Endpoints "docker").Host}}')
case "$docker_endpoint" in *[Pp][Oo][Dd][Mm][Aa][Nn]*) echo "Podman endpoint is forbidden: $docker_endpoint" >&2; exit 1 ;; esac
builder_info=$(docker --context "$docker_context" buildx inspect "$buildx_builder" 2>&1) || {
  printf '%s\n' "$builder_info" >&2
  exit 1
}
printf '%s\n' "Selected context: $docker_context"
printf '%s\n' "Docker endpoint: $docker_endpoint"
printf '%s\n' "Selected builder: $buildx_builder"
printf '%s\n' "$builder_info"
printf '%s\n' "$builder_info" | grep -Eq '^Driver:[[:space:]]+docker-container$' ||
  { echo "canonical builder driver must be docker-container" >&2; exit 1; }
printf '%s\n' "$builder_info" | grep -Eq '^[[:space:]]*Status:[[:space:]]+running$' ||
  { echo "canonical builder is not running" >&2; exit 1; }

output_dir=${DENDRITE_RELEASE_OUTPUT_DIR:-dist/release}
export_dir=$(mktemp -d)
trap 'find "$export_dir" -type f -delete; find "$export_dir" -depth -type d -empty -delete' EXIT HUP INT TERM

docker --context "$docker_context" buildx build \
  --builder "$buildx_builder" \
  --platform linux/amd64 \
  --file Dockerfile.repro \
  --target artifacts \
  --output "type=local,dest=$export_dir" \
  ${DENDRITE_DOCKER_NO_CACHE:+--no-cache} \
  --build-arg "DENDRITE_CANISTER_ID=$DENDRITE_CANISTER_ID" \
  --build-arg "DENDRITE_DERIVATION_ORIGIN=$DENDRITE_DERIVATION_ORIGIN" \
  --build-arg "DENDRITE_ALTERNATIVE_ORIGINS_JSON=$DENDRITE_ALTERNATIVE_ORIGINS_JSON" \
  --build-arg "DENDRITE_API_HOST=$DENDRITE_API_HOST" \
  --build-arg "DENDRITE_IDENTITY_PROVIDER=$DENDRITE_IDENTITY_PROVIDER" \
  .

[ -f "$export_dir/dendrite.wasm" ]
[ -d "$export_dir/frontend" ]
[ -f "$export_dir/asset-manifest.json" ]
[ -f "$export_dir/build-configuration.txt" ]

if [ -e "$output_dir" ]; then
  find "$output_dir" -type f -delete
  find "$output_dir" -depth -type d -empty -delete
fi
mkdir -p "$output_dir"
cp "$export_dir/dendrite.wasm" "$export_dir/asset-manifest.json" "$export_dir/build-configuration.txt" "$output_dir/"
cp -R "$export_dir/frontend" "$output_dir/frontend"
(
  cd "$output_dir"
  find . -type f ! -name SHA256SUMS -printf '%P\0' |
    LC_ALL=C sort -z |
    xargs -0 sha256sum > SHA256SUMS
)
(
  cd "$output_dir"
  sha256sum -c SHA256SUMS >/dev/null
)
sed "s|  |  $output_dir/|" "$output_dir/SHA256SUMS"
