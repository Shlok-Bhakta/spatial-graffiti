#!/usr/bin/env python3
"""Print a compatible available iOS Simulator UDID for a device family."""

import json
import subprocess
import sys
from typing import Any


def version_tuple(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.replace("-", ".").split(".") if part.isdigit())


def choose_device(data: dict[str, Any], family: str) -> dict[str, Any]:
    candidates = []
    for runtime, devices in data.get("devices", {}).items():
        if "iOS" not in runtime:
            continue
        runtime_version = version_tuple(runtime.rsplit("iOS-", 1)[-1])
        for device in devices:
            if device.get("isAvailable") and family in device.get("name", ""):
                candidates.append(
                    {
                        "runtime_version": runtime_version,
                        "booted": device.get("state") == "Booted",
                        "name": device["name"],
                        "udid": device["udid"],
                    }
                )

    if not candidates:
        raise RuntimeError(f"no available {family} simulator found")

    newest_runtime = max(candidate["runtime_version"] for candidate in candidates)
    candidates = [
        candidate for candidate in candidates if candidate["runtime_version"] == newest_runtime
    ]

    booted = [candidate for candidate in candidates if candidate["booted"]]
    if booted:
        candidates = booted

    preferred_names = (
        ("iPhone 17 Pro", "iPhone 17", "iPhone 16 Pro", "iPhone 16", "iPhone 15 Pro")
        if family == "iPhone"
        else ("iPad Pro 13-inch (M5)", "iPad Pro 11-inch (M5)", "iPad Air 13-inch (M4)")
    )
    by_name = {candidate["name"]: candidate for candidate in candidates}
    return next(
        (by_name[name] for name in preferred_names if name in by_name),
        sorted(candidates, key=lambda candidate: candidate["name"])[0],
    )


def main() -> None:
    family = sys.argv[1] if len(sys.argv) > 1 else "iPhone"
    if family not in {"iPhone", "iPad"}:
        raise SystemExit("usage: select-simulator.py [iPhone|iPad]")

    data = json.loads(
        subprocess.check_output(
            ["xcrun", "simctl", "list", "devices", "available", "--json"], text=True
        )
    )

    try:
        chosen = choose_device(data, family)
    except RuntimeError as error:
        raise SystemExit(str(error)) from error

    runtime = ".".join(str(part) for part in chosen["runtime_version"])
    print(
        f"Selected {chosen['name']} on iOS {runtime}",
        file=sys.stderr,
    )
    print(chosen["udid"])


if __name__ == "__main__":
    main()
