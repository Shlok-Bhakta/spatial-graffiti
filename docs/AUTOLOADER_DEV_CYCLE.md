# Autoloader PR preview

Copy this into other Marginally Better apps. The installer is Autoloader; this is how a PR puts a tappable install link on the phone.

## Why this shape

- Autoloader downloads a plain HTTPS IPA. GitHub Actions artifact URLs 404 unless you are logged into github.com.
- GitHub markdown will not turn `autoloader://` into a tap target. PR comments can only link `https://`.
- A public **prerelease** tagged `pr-<number>` is a normal GitHub download URL, same as any release asset.
- A tiny **GitHub Pages** page is the tappable `https://` link. It immediately opens `autoloader://install?url=<encoded IPA URL>`.

Do not use Planista for the IPA. Do not use nightly.link.

## PR cycle

1. Open a PR against `main`.
2. CI archives an unsigned IPA and publishes (or replaces) GitHub prerelease `pr-N` with a stable asset name.
3. CI writes `pr/N/index.html` on `gh-pages` and comments `[Open in Autoloader](https://<org>.github.io/<repo>/pr/N/)`.
4. On the phone, tap that comment link. If the GitHub app swallows the custom scheme, open the page in Safari.
5. Autoloader signs with the certificate already in Settings and installs with **Server** (no pairing file, no VPN).
6. Closing the PR deletes the `pr-N` release/tag and the Pages trampoline.

Keep `CFBundleIdentifier` stable across previews so Autoloader upgrades in place.

## CI pieces

- `scripts/write-autoloader-page.py` — HTTPS trampoline HTML.
- PR workflow: `gh release create pr-$N <ipa> --prerelease --latest=false --target $HEAD_SHA`, then deploy the HTML to `gh-pages` under `pr/$N/`.
- Closed-PR workflow: `gh release delete pr-$N --yes --cleanup-tag`.
- Same-repo PRs only. Fork PRs cannot publish with `GITHUB_TOKEN`.

`pr-N` tags are preview bookmarks, not product versions. Product releases can stay tagless.

## Phone setup (once)

Install Autoloader, import a signing certificate, leave Installation Type on Server. After that, the PR comment is the install path.
