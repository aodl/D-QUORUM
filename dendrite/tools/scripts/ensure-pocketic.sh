#!/bin/sh
set -eu

version='15.0.0'
expected='29472ea4433b30a280676c4e22e369d79d5ba6ee1b4d48bab32ebe7d0ad2b4bb'
destination="dist/tools/pocket-ic-server-$version/pocket-ic"
url="https://github.com/dfinity/pocketic/releases/download/$version/pocket-ic-x86_64-linux.gz"

if [ -x "$destination" ] && printf '%s  %s\n' "$expected" "$destination" | sha256sum --check --status; then
    exit 0
fi

mkdir -p "$(dirname "$destination")"
archive=$(mktemp)
binary=$(mktemp)
trap 'rm -f "$archive" "$binary"' EXIT
curl --fail --location --silent --show-error "$url" --output "$archive"
gzip --decompress --stdout "$archive" > "$binary"
printf '%s  %s\n' "$expected" "$binary" | sha256sum --check --status
chmod 755 "$binary"
mv "$binary" "$destination"
