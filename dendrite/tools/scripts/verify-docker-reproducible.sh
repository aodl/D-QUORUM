#!/bin/sh
set -eu

first=$(mktemp -d)
second=$(mktemp -d)
trap 'find "$first" "$second" -type f -delete; find "$first" "$second" -depth -type d -empty -delete' EXIT HUP INT TERM

DENDRITE_DOCKER_NO_CACHE=1 DENDRITE_RELEASE_OUTPUT_DIR="$first" tools/scripts/docker-build-release.sh
DENDRITE_DOCKER_NO_CACHE=1 DENDRITE_RELEASE_OUTPUT_DIR="$second" tools/scripts/docker-build-release.sh

for release in "$first" "$second"; do
  grep -R -q 'docs/operations/reproducible-builds\.md' "$release/frontend/generated"
  grep -R -q 'docs/security\.md' "$release/frontend/generated"
  ! grep -R -q -E 'docs/development/reproducible-builds\.md|docs/security/threat-model\.md' "$release/frontend"
done

diff -qr "$first" "$second"
cmp "$first/SHA256SUMS" "$second/SHA256SUMS"
(
  cd "$first"
  sha256sum -c SHA256SUMS
)
echo "two clean canonical Docker builds are byte-identical"
cat "$first/SHA256SUMS"
