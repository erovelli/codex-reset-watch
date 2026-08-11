# Homebrew release process

The core package is already Homebrew-friendly: `dist/cli.js` is a self-contained executable bundle, the formula depends on Node, and `install` copies that bundle to a separate stable per-user runtime for scheduled work.

For a real release:

1. Run the full CI suite and publish the exact version to npm.
2. Download the immutable npm tarball and calculate its SHA-256.
3. Copy `codex-reset-watch.rb.template` into the tap as `Formula/codex-reset-watch.rb`.
4. Replace `VERSION`, `RELEASE_TARBALL_URL`, and `SHA256` with the real published values.
5. Run `brew audit --strict`, `brew style`, and `brew test` in the tap.

Do not publish the template itself as a working formula: its placeholders are deliberate and no release artifact exists yet.
