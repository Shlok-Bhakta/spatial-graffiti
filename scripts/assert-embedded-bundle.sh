#!/usr/bin/env bash
# Fail if an IPA was built against Metro instead of an embedded JS bundle.
set -euo pipefail

IPA="${1:?Usage: $0 <app.ipa>}"
WORK_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

unzip -q "$IPA" -d "$WORK_DIR"
APP="$(find "$WORK_DIR/Payload" -maxdepth 1 -type d -name '*.app' | head -1)"
if [[ -z "$APP" ]]; then
  echo "error: no Payload app in $IPA" >&2
  exit 1
fi

if ! find "$APP" \( -name '*.jsbundle' -o -name '*.hbc' \) | grep -q .; then
  echo "error: IPA does not contain an embedded JS bundle" >&2
  ls -la "$APP" >&2
  exit 1
fi

echo "Embedded JS bundle present in $IPA"
