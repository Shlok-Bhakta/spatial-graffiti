#!/usr/bin/env python3
"""Tests for the Autoloader HTTPS trampoline page."""

import importlib.util
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("write-autoloader-page.py")
SPEC = importlib.util.spec_from_file_location("write_autoloader_page", SCRIPT)
assert SPEC and SPEC.loader
page = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(page)


class WriteAutoloaderPageTests(unittest.TestCase):
    def test_encodes_the_ipa_url_as_one_query_value(self) -> None:
        ipa = "https://github.com/org/repo/releases/download/pr-12/QR-Scanner-unsigned.ipa"
        url = page.autoloader_url(ipa)
        self.assertTrue(url.startswith("autoloader://install?url="))
        self.assertIn("https%3A%2F%2Fgithub.com%2Forg%2Frepo", url)
        self.assertNotIn("url=https://", url)

    def test_page_opens_autoloader_and_keeps_an_https_fallback(self) -> None:
        ipa = "https://example.test/app.ipa?x=1&y=2"
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "index.html"
            page.write_page(ipa_url=ipa, output=output, title="QR Scanner")
            html = output.read_text()
        self.assertIn("autoloader://install?url=", html)
        self.assertIn("https%3A%2F%2Fexample.test%2Fapp.ipa%3Fx%3D1%26y%3D2", html)
        self.assertIn("https://example.test/app.ipa", html)
        self.assertIn("&amp;y=2", html)
        self.assertIn("Open in Autoloader", html)
        self.assertNotIn("nightly.link", html)


if __name__ == "__main__":
    unittest.main()
