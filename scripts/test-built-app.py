#!/usr/bin/env python3
"""Assert the built iOS app bundle still carries AR privacy strings."""

from pathlib import Path
import plistlib
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: test-built-app.py <SpatialGraffiti.app>", file=sys.stderr)
        return 2

    app = Path(sys.argv[1])
    info_path = app / "Info.plist"
    if not info_path.exists():
        print(f"error: missing {info_path}", file=sys.stderr)
        return 1

    with info_path.open("rb") as handle:
        info = plistlib.load(handle)

    camera = info.get("NSCameraUsageDescription")
    if not camera or "AR" not in camera:
        print("error: NSCameraUsageDescription mismatch", file=sys.stderr)
        print(camera, file=sys.stderr)
        return 1

    location = info.get("NSLocationWhenInUseUsageDescription")
    if not location or "location" not in location.lower():
        print("error: NSLocationWhenInUseUsageDescription mismatch", file=sys.stderr)
        print(location, file=sys.stderr)
        return 1

    if info.get("UIDesignRequiresCompatibility") is True:
        print("error: UIDesignRequiresCompatibility opts out of Liquid Glass", file=sys.stderr)
        return 1

    print(f"ok {app}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
