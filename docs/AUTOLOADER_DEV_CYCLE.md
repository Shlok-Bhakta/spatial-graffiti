# Autoloader PR preview

The installer is Autoloader. A PR puts a tappable install link on the phone.

## Why this shape

- Autoloader downloads a plain HTTPS IPA. GitHub Actions artifact URLs 404 unless you are logged into github.com.
- GitHub markdown will not turn `autoloader://` into a tap target. PR comments can only link `https://`.
- A public **prerelease** tagged `pr-<number>` is a normal GitHub download URL.
- The tappable link is the existing global shim, not a per-repo Pages page:

```
https://marginally-better-apps.github.io/Autoloader/?url=<percent-encoded IPA URL>
```

Do not use Planista for the IPA. Do not use nightly.link. Do not publish a second trampoline on this repo's GitHub Pages.

## PR cycle

1. Open a PR against `main`.
2. CI archives an unsigned IPA and publishes (or replaces) GitHub prerelease `pr-N` with a stable asset name.
3. CI comments `[Open in Autoloader](https://marginally-better-apps.github.io/Autoloader/?url=...)`.
4. On the phone, tap that comment link. If the GitHub app swallows the custom scheme, open the link in Safari.
5. Autoloader signs with the certificate already in Settings and installs with **Server** (no pairing file, no VPN).
6. Closing the PR deletes the `pr-N` release/tag.

Keep `CFBundleIdentifier` stable across previews so Autoloader upgrades in place.

## CI pieces

- PR workflow: `gh release create pr-$N <ipa> --prerelease --latest=false --target $HEAD_SHA`, then comment the shared shim.
- Closed-PR workflow: `gh release delete pr-$N --yes --cleanup-tag`.
- Same-repo PRs only. Fork PRs cannot publish with `GITHUB_TOKEN`.

`pr-N` tags are preview bookmarks, not product versions. Product releases can stay tagless.

## Phone setup (once)

Install Autoloader, import a signing certificate, leave Installation Type on Server. After that, the PR comment is the install path.
