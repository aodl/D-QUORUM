#!/bin/sh
set -eu

[ -f icp.yaml ] && [ -f Cargo.lock ] || { echo "run from the repository root" >&2; exit 1; }
release=dist/release
wasm=$release/dendrite.wasm
sums=$release/SHA256SUMS
[ -f "$wasm" ] || { echo "missing $wasm" >&2; exit 1; }
[ -f "$sums" ] || { echo "missing $sums" >&2; exit 1; }

grep -Eq '^[[:space:]]+type: "@dfinity/prebuilt@v2\.0\.0"$' icp.yaml ||
  { echo "icp.yaml must use the pinned prebuilt recipe" >&2; exit 1; }
manifest_path=$(sed -n 's/^[[:space:]]*path:[[:space:]]*//p' icp.yaml)
manifest_hash=$(sed -n 's/^[[:space:]]*sha256:[[:space:]]*//p' icp.yaml)
[ "$manifest_path" = "$wasm" ] || { echo "icp.yaml path must be $wasm" >&2; exit 1; }
printf '%s\n' "$manifest_hash" | grep -Eq '^[0-9a-f]{64}$' ||
  { echo "icp.yaml sha256 must be lowercase hexadecimal SHA-256" >&2; exit 1; }
actual_hash=$(sha256sum "$wasm" | cut -d ' ' -f 1)
[ "$manifest_hash" = "$actual_hash" ] || { echo "icp.yaml Wasm hash mismatch" >&2; exit 1; }
grep -Eq "^[0-9a-f]{64}  dendrite\\.wasm$" "$sums" ||
  { echo "SHA256SUMS does not list dendrite.wasm" >&2; exit 1; }
! grep -Eq '(^|[ /])SHA256SUMS$' "$sums" ||
  { echo "SHA256SUMS must not hash itself" >&2; exit 1; }
awk '
  length($0) < 67 || substr($0, 65, 2) != "  " { exit 1 }
  {
    path = substr($0, 67)
    if (path ~ /^\// || path ~ /(^|\/)\.\.?($|\/)/) exit 1
  }
' "$sums" || { echo "SHA256SUMS paths must be relative and canonical" >&2; exit 1; }
manifest_paths=$(sed 's/^[0-9a-f]\{64\}  //' "$sums")
[ "$manifest_paths" = "$(printf '%s\n' "$manifest_paths" | LC_ALL=C sort)" ] ||
  { echo "SHA256SUMS entries must use deterministic byte ordering" >&2; exit 1; }
(
  cd "$release"
  sha256sum -c SHA256SUMS
)
