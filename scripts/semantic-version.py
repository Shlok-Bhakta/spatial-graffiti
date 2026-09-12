#!/usr/bin/env python3
"""Calculate a tagless semantic version from first-parent commit messages."""

import re
import subprocess
import sys


CONVENTIONAL = re.compile(
    r"^(?P<type>fix|feat)(?:\([^)]*\))?(?P<breaking>!)?:\s+.+$"
)


def classify(message: str) -> str:
    """Return the release bump represented by the first conventional line."""
    matches = (
        CONVENTIONAL.match(line.strip()) for line in message.splitlines() if line.strip()
    )
    match = next((candidate for candidate in matches if candidate is not None), None)
    if match is None:
        return "none"

    if match.group("type") == "fix" and match.group("breaking"):
        return "none"
    if match.group("breaking"):
        return "major"
    if match.group("type") == "feat":
        return "minor"
    return "patch"


def bump(version: tuple[int, int, int], message: str) -> tuple[int, int, int]:
    """Apply the first releasable Conventional Commit line in a commit message."""
    major, minor, patch = version
    kind = classify(message)
    if kind == "major":
        return major + 1, 0, 0
    if kind == "minor":
        return major, minor + 1, 0
    if kind == "patch":
        return major, minor, patch + 1
    return version


def version_from_messages(messages: list[str]) -> tuple[int, int, int]:
    version = (0, 0, 0)
    for message in messages:
        version = bump(version, message)
    return version


def git_messages(revision: str) -> list[str]:
    raw = subprocess.check_output(
        ["git", "log", "--first-parent", "--reverse", "--format=%B%x00", revision],
        text=True,
    )
    return [message for message in raw.split("\0") if message.strip()]


if __name__ == "__main__":
    arguments = sys.argv[1:]
    if arguments and arguments[0] == "--kind":
        revision = arguments[1] if len(arguments) > 1 else "HEAD"
        messages = git_messages(revision)
        print(classify(messages[-1]) if messages else "none")
    else:
        revision = arguments[0] if arguments else "HEAD"
        print(".".join(map(str, version_from_messages(git_messages(revision)))))
