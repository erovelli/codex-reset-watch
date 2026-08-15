# Release checklist

These checks are release gates, not suggestions. Publish only from a clean `main` commit after CI succeeds on Node 22 and 24 for macOS and Linux.

## One-time npm setup

The first release of an unscoped package must be created interactively by an npm account with two-factor authentication:

```bash
npm login
npm whoami
npm publish
```

After the package exists, configure npm Trusted Publishing with these exact values:

- provider: GitHub Actions
- owner: `erovelli`
- repository: `codex-reset-watch`
- workflow filename: `release.yml`
- allowed action: `npm publish`

Then set npm publishing access to require two-factor authentication and disallow tokens. Do not add an npm write token to GitHub. The release workflow uses short-lived OIDC credentials and npm generates provenance automatically. The workflow safely verifies, rather than republishes, an initial version that was already published from the same Git commit.

Enable GitHub private vulnerability reporting before announcing the package publicly.

## Every release

1. Update `package.json` using semantic versioning. The CLI reads this value directly, so there is no second version constant.
2. Update the README and release notes for user-visible behavior, migration steps, new permissions, and compatibility changes.
3. Install exactly the locked dependencies and run all release gates:

   ```bash
   npm ci
   npm run release:check
   npm pack --dry-run
   ```

4. Confirm the audit reports no high or critical vulnerabilities. Review every outdated direct dependency; major upgrades may be deferred only when they are not security fixes and the supported release line remains maintained.
   If the lockfile changes a dependency with an install script, review that script and update the exact `allowScripts` pin in `package.json`; never approve an unreviewed lifecycle script or an open-ended version range.
5. Inspect the dry-run manifest. It must contain the executable bundle, source map, README, project license, third-party licenses, and Homebrew release material—no configuration, state, logs, credentials, or development fixtures.
6. Smoke-test the exact tarball in a clean temporary environment:

   ```bash
   npm pack --pack-destination /tmp/codex-reset-watch-package
   npm install --global /tmp/codex-reset-watch-package/codex-reset-watch-*.tgz
   codex-reset-watch --version
   codex-reset-watch --help
   ```

7. Merge to `main` and wait for both CI and the Web Push setup-app deployment to succeed.
8. Create an annotated `vX.Y.Z` tag on that exact `main` commit, push it, and publish a GitHub Release from the tag. Publishing the GitHub Release triggers `.github/workflows/release.yml`.
9. Verify npm before announcing the release:

   ```bash
   npm view codex-reset-watch version dist.integrity gitHead
   npx --yes codex-reset-watch@X.Y.Z --version
   ```

10. Confirm the npm page shows provenance for trusted-publisher releases and that `gitHead` matches the tagged commit.

## Homebrew

Homebrew is not released from placeholders. Follow [`packaging/homebrew/README.md`](packaging/homebrew/README.md) only after the immutable npm or GitHub artifact exists.
