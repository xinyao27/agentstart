# Releasing Yiru

Yiru releases are prepared locally and published by GitHub Actions. Local preparation owns version
alignment; CI owns signing, notarization, registry uploads, Chrome Web Store submission, TestFlight,
the optional APNs gateway, and pinning the Homebrew formula's checksums from the signed Rust
artifacts (the Rust release bytes only exist after CI signs and notarizes them, so they cannot be
checksummed locally). Release credentials stay in GitHub and are never written into the repository.

## One-time setup

Run the interactive setup once from the repository root. It opens the provider pages that require
a human sign-in and saves the values you paste directly into GitHub repository or environment
Secrets:

```bash
pnpm release:setup
```

The setup is safe to rerun: existing Secret names are detected and their values are left unchanged.
No credential value is written into the checkout.

The release workflows require these GitHub repository secrets:

- `NPM_TOKEN` for the first `@yiru/cli` publication. Create a granular npm token with read/write
  access to the `@yiru` scope and publishing 2FA bypass. After the first release, configure npm
  Trusted Publishing for repository `xinyao27/yiru`, workflow `daemon-release.yml`, and the
  `npm publish` action; then remove the long-lived token.
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APNS_KEY_ID`, `APNS_KEY_P8`,
  `APNS_TEAM_ID`, and `GATEWAY_SHARED_SECRET` only when deploying the optional APNs gateway.
- The Apple signing, notarization, and App Store Connect values referenced by
  `daemon-release.yml` and `mobile-release.yml`.

Create the `chrome-web-store` GitHub environment and store `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
`CWS_REFRESH_TOKEN`, and `CWS_PUBLISHER_ID` as environment secrets. The OAuth client must enable
the Chrome Web Store API and allow `https://developers.google.com/oauthplayground` as a redirect
URI. Generate the refresh token with the
`https://www.googleapis.com/auth/chromewebstore` scope.

The APNs workflow sends its four runtime secrets to Wrangler through a runner-only file and deletes
that file before the job ends. Cloudflare preserves other Worker secrets that are not included.
APNs is optional: set the repository variable `APNS_GATEWAY_ENABLED=true` only when its credentials
are configured. Otherwise the workflow validates the Worker without deploying it.

## Prepare a release

Start from a clean `main` that exactly matches `origin/main`, with Rust 1.95, Node.js 24, and
Bun 1.4.0 installed (`prepare` compiles the daemon locally):

```bash
pnpm install --frozen-lockfile
pnpm release -- prepare 0.0.37
```

The command updates the workspace, daemon, extension, and npm CLI versions; builds the daemon
target matrix; packages the Chrome extension; and runs `pnpm check`. It deliberately does not
commit or push. Review the generated release changes, commit them, and push `main` using the
commands printed at the end.

The daemon release workflow builds the seven `yiru-rust-*` binaries on runners matching their
operating system and CPU, checksums, attests, and attaches them to the GitHub release, and then
pins the four Homebrew formula checksums by committing `Formula/yiru.rb` to `main` via the
contents API. npm, Homebrew, and the curl installer all select `yiru-rust-*`.

## Publish

After the release commit is present on `origin/main`, run:

```bash
pnpm release -- publish 0.0.37
```

Type the version at the confirmation gate. The command verifies credentials, creates and atomically
pushes `v0.0.37` and `extension-v0.0.37`. Those tags trigger the daemon/npm/Homebrew and Chrome
release workflows, then it starts the iOS TestFlight upload. The daemon is not a separate product
surface: it is the runtime required by the Chrome extension and paired iOS app.

Skip one target when necessary:

```bash
pnpm release -- publish 0.0.37 --skip-extension
pnpm release -- publish 0.0.37 --skip-daemon
pnpm release -- publish 0.0.37 --skip-ios
```

APNs is optional infrastructure for iPhone background notifications:

| Target | When it publishes | How to publish |
| --- | --- | --- |
| APNs | `apps/apns-gateway` or its dependency graph changes on `main` and the gateway is enabled | Automatic, or manually run `APNs Gateway` |

The conductor can select the TestFlight audience and optionally redeploy APNs:

```bash
pnpm release -- publish 0.0.37 --ios-distribution external \
  --ios-changelog 'Faster connections and lower resource usage.'
pnpm release -- publish 0.0.37 --with-apns
```

If a tag already exists at the current release commit, the command dispatches its workflow again
instead of recreating the tag. Registry publication is also idempotent: an existing npm version is
reported and skipped.

Follow the latest workflow runs with:

```bash
pnpm release -- status 0.0.37
```
