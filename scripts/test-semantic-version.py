#!/usr/bin/env python3
"""Dependency-free tests for the tagless release version calculator."""

import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).with_name("semantic-version.py")
SPEC = importlib.util.spec_from_file_location("semantic_version", SCRIPT)
assert SPEC and SPEC.loader
semantic_version = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(semantic_version)


class SemanticVersionTests(unittest.TestCase):
    def test_classifies_supported_release_types(self) -> None:
        self.assertEqual(semantic_version.classify("fix: repair startup"), "patch")
        self.assertEqual(semantic_version.classify("feat(scan): add torch"), "minor")
        self.assertEqual(semantic_version.classify("feat(scan)!: replace API"), "major")
        self.assertEqual(semantic_version.classify("docs: explain setup"), "none")
        self.assertEqual(semantic_version.classify("fix!: unsupported breaking fix"), "none")

    def test_only_release_commit_types_bump(self) -> None:
        messages = ["docs: explain scanning", "fix: avoid duplicate scan", "chore: tidy"]
        self.assertEqual(semantic_version.version_from_messages(messages), (0, 0, 1))

    def test_feature_resets_patch(self) -> None:
        messages = ["fix: one", "fix(ui): two", "feat: add history"]
        self.assertEqual(semantic_version.version_from_messages(messages), (0, 1, 0))

    def test_breaking_feature_bumps_major(self) -> None:
        messages = ["feat: scanner", "feat!: replace scan result model"]
        self.assertEqual(semantic_version.version_from_messages(messages), (1, 0, 0))

    def test_scoped_breaking_feature_bumps_major(self) -> None:
        self.assertEqual(semantic_version.bump((1, 2, 3), "feat(scan)!: replace API"), (2, 0, 0))

    def test_breaking_fix_is_not_a_release_type(self) -> None:
        self.assertEqual(semantic_version.bump((1, 2, 3), "fix!: unexpected form"), (1, 2, 3))

    def test_merge_commit_body_can_hold_pr_title(self) -> None:
        message = "Merge pull request #12 from example/branch\n\nfix: repair camera startup"
        self.assertEqual(semantic_version.bump((1, 2, 3), message), (1, 2, 4))


if __name__ == "__main__":
    unittest.main()
