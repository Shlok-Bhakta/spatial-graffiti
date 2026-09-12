#!/usr/bin/env python3
"""Write a GitHub Pages trampoline that opens autoloader://."""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path
from urllib.parse import quote


def autoloader_url(ipa_url: str) -> str:
    return "autoloader://install?url=" + quote(ipa_url, safe="")


def render_page(ipa_url: str, title: str) -> str:
    open_url = autoloader_url(ipa_url)
    href = escape(open_url, quote=True)
    ipa_href = escape(ipa_url, quote=True)
    heading = escape(title)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0;url={href}">
  <title>Install {heading} with Autoloader</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{
      margin: 0;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: #1c1210;
      color: #f4e8e4;
    }}
    main {{
      width: min(28rem, calc(100% - 2rem));
      text-align: center;
    }}
    a.install {{
      display: block;
      padding: 1.1rem 1.25rem;
      border-radius: 1rem;
      background: #f67966;
      color: #1c1210;
      font-weight: 700;
      text-decoration: none;
    }}
    p {{ line-height: 1.45; color: #d8c4bd; }}
    .fallback {{ margin-top: 1.5rem; font-size: 0.95rem; }}
    .fallback a {{ color: #f98a79; }}
  </style>
  <script>
    location.replace({open_url!r});
  </script>
</head>
<body>
  <main>
    <p>Opening Autoloader to install {heading}.</p>
    <p><a class="install" href="{href}">Open in Autoloader</a></p>
    <p class="fallback">If nothing happens, open this page in Safari, or
      <a href="{ipa_href}">download the unsigned IPA</a> and sign it in Feather.</p>
  </main>
</body>
</html>
"""


def write_page(*, ipa_url: str, output: Path, title: str) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_page(ipa_url, title), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ipa-url", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--title", default="this build")
    args = parser.parse_args()
    write_page(ipa_url=args.ipa_url, output=args.output, title=args.title)


if __name__ == "__main__":
    main()
