#!/usr/bin/env bash
# Package an unsigned .xcarchive application as an IPA payload.
set -euo pipefail

ARCHIVE="${1:?Usage: $0 <archive.xcarchive> <output.ipa>}"
OUTPUT="${2:?Usage: $0 <archive.xcarchive> <output.ipa>}"
APP="$(find "$ARCHIVE/Products/Applications" -maxdepth 1 -type d -name '*.app' | head -1)"

if [[ -z "$APP" ]]; then
  echo "error: no app found in $ARCHIVE/Products/Applications" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$WORK_DIR/Payload" "$(dirname "$OUTPUT")"
cp -R "$APP" "$WORK_DIR/Payload/"
OUTPUT_ABSOLUTE="$(cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")"
(
  cd "$WORK_DIR"
  zip -qry "$OUTPUT_ABSOLUTE" Payload
)

test -s "$OUTPUT_ABSOLUTE"
unzip -tq "$OUTPUT_ABSOLUTE"
echo "Packaged $OUTPUT_ABSOLUTE"
