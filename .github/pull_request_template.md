## What changed

<!-- Describe the user-visible outcome and any important implementation choices. -->

## Verification

<!-- List the tests, simulator/device checks, or Maestro flow you ran. -->

- [ ] Tests pass locally or in CI
- [ ] The app still launches on iPhone and iPad

## Release title

The PR title controls tagless releases when this PR lands on `main`:

- `fix: ...` bumps the patch version.
- `feat: ...` bumps the minor version.
- `feat!: ...` (or `feat(scope)!: ...`) bumps the major version.
- Every other title creates no release.

Use squash merge so the PR title becomes the commit subject. Product releases are unsigned IPA workflow artifacts and do not use version tags. Open PRs also publish an ephemeral `pr-<number>` preview for Autoloader; that tag is deleted when the PR closes.
