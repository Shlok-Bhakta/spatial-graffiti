#!/usr/bin/env python3
"""Regression tests for pull-request workflow performance and safeguards."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"


def workflow(name: str) -> str:
    return (WORKFLOWS / name).read_text()


class PullRequestWorkflowTests(unittest.TestCase):
    def test_every_pr_workflow_cancels_superseded_runs(self) -> None:
        for name in ("ci.yml", "pr-title.yml", "unsigned-ipa.yml"):
            with self.subTest(workflow=name):
                text = workflow(name)
                self.assertRegex(
                    text,
                    r"concurrency:\s+group: .*github\.event\.pull_request\.number"
                    r".*\|\| github\.ref.*\s+cancel-in-progress: true",
                )

    def test_ci_jobs_remain_independent(self) -> None:
        text = workflow("ci.yml")
        scripts_job = text[text.index("  scripts:") : text.index("  ios:")]
        ios_job = text[text.index("  ios:") :]
        self.assertNotIn("needs:", scripts_job)
        self.assertNotIn("needs:", ios_job)

    def test_simulator_tests_use_a_runner_with_xcode_16(self) -> None:
        text = workflow("ci.yml")
        ios_job = text[text.index("  ios:") :]
        self.assertIn("runs-on: macos-15", ios_job)
        self.assertIn("xcode-select", ios_job)
        self.assertIn("Xcode_26", ios_job)
        self.assertLess(ios_job.index("xcode-select"), ios_job.index("xcodebuild build"))

    def test_ipa_and_release_select_an_ios_26_sdk_xcode(self) -> None:
        for name in ("unsigned-ipa.yml", "release.yml"):
            with self.subTest(workflow=name):
                text = workflow(name)
                self.assertIn("xcode-select", text)
                self.assertIn("Xcode_26", text)
                self.assertLess(text.index("xcode-select"), text.index("xcodebuild archive"))

    def test_expo_modules_jsi_date_abs_is_disambiguated_for_xcode_26(self) -> None:
        plugin = (ROOT / "plugins" / "withIosGraffiti.js").read_text()
        self.assertIn("JavaScriptCodable+Date.swift", plugin)
        self.assertIn("Swift.abs(milliseconds)", plugin)
        date_swift = (
            ROOT
            / "node_modules"
            / "expo-modules-jsi"
            / "apple"
            / "Sources"
            / "ExpoModulesJSI"
            / "Coding"
            / "JavaScriptCodable+Date.swift"
        )
        self.assertTrue(date_swift.exists(), "npm ci must install expo-modules-jsi before this test")
        source = date_swift.read_text()
        if "Swift.abs(milliseconds)" not in source:
            self.assertIn("abs(milliseconds)", source)

    def test_ci_cache_is_invalidated_by_toolchain_and_build_inputs(self) -> None:
        text = workflow("ci.yml")
        self.assertIn("id: xcode", text)
        self.assertIn("xcodebuild -version", text)
        self.assertIn("id: test-build-cache", text)
        self.assertIn("steps.xcode.outputs.cache-key", text)
        for build_input in (
            "package-lock.json",
            "app.json",
            ".env",
            "src/**",
            "modules/**",
            "plugins/**",
        ):
            with self.subTest(build_input=build_input):
                self.assertIn(build_input, text)

    def test_debug_builds_can_embed_the_js_bundle(self) -> None:
        plugin = (ROOT / "plugins" / "withIosGraffiti.js").read_text()
        self.assertIn("FORCE_BUNDLING", plugin)
        self.assertIn("SKIP_BUNDLING", plugin)
        self.assertIn("-z", plugin)
        self.assertIn("jsbundle", plugin)
        self.assertIn("bundleURL", plugin)

    def test_ipa_archive_does_not_launch_metro(self) -> None:
        for name in ("unsigned-ipa.yml", "release.yml"):
            with self.subTest(workflow=name):
                self.assertIn("RCT_NO_LAUNCH_PACKAGER", workflow(name))

    def test_cold_cache_builds_before_running_tests(self) -> None:
        text = workflow("ci.yml")
        self.assertIn("if: steps.test-build-cache.outputs.cache-hit != 'true'", text)
        self.assertIn("xcodebuild build", text)
        self.assertIn("FORCE_BUNDLING", text)
        self.assertIn("-configuration Release", text)

    def test_warm_cache_reuses_test_build_without_rebuilding(self) -> None:
        text = workflow("ci.yml")
        self.assertIn("Verify bundled app without rebuilding", text)
        self.assertNotRegex(text, r"xcodebuild test")
        self.assertNotRegex(text, r"xcodebuild test-without-building")

    def test_existing_validation_and_device_support_are_preserved(self) -> None:
        ci = workflow("ci.yml")
        ipa = workflow("unsigned-ipa.yml")
        release = workflow("release.yml")
        self.assertIn("python3 scripts/test-semantic-version.py", ci)
        self.assertIn("npm test", ci)
        self.assertIn('test "$FAMILY" = "1,2"', ci)
        self.assertIn("xcodebuild archive", ipa)
        self.assertIn("xcodebuild archive", release)
        self.assertIn("Package IPA", ipa)
        self.assertIn("Package IPA", release)
        self.assertIn("assert-embedded-bundle.sh", ipa)
        self.assertIn("assert-embedded-bundle.sh", release)

    def test_pr_ipa_publishes_a_tappable_autoloader_preview(self) -> None:
        ipa = workflow("unsigned-ipa.yml")
        self.assertIn("contents: write", ipa)
        self.assertIn("pull-requests: write", ipa)
        self.assertIn("gh release create", ipa)
        self.assertIn('TAG="pr-${PR_NUMBER}"', ipa)
        self.assertIn("target-folder: pr/", ipa)
        self.assertIn("write-autoloader-page.py", ipa)
        self.assertIn("github.io", ipa)
        self.assertIn("autoloader-pr-preview", ipa)
        self.assertIn("head.repo.full_name == github.repository", ipa)
        self.assertNotIn("nightly.link", ipa)
        self.assertNotRegex(ipa, r"(?m)^EOF$")

    def test_closed_prs_delete_the_preview_release(self) -> None:
        text = workflow("pr-preview-cleanup.yml")
        self.assertIn("types: [closed]", text)
        self.assertIn("gh release delete", text)
        self.assertIn("--cleanup-tag", text)
        self.assertIn("TAG: pr-", text)


if __name__ == "__main__":
    unittest.main()
