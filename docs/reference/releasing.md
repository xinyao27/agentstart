# Releasing AgentStart

AgentStart releases are prepared locally and published by GitHub Actions. Local preparation owns version
alignment; CI owns signing, notarization, registry uploads, Chrome Web Store submission, TestFlight,
and publishing the Homebrew formula from the signed Rust artifacts. The tagged source contains only
`Formula/agentstart.rb.template`; it cannot be installed. CI renders `Formula/agentstart.rb` with
the actual artifact checksums only after the GitHub Release is public, then writes that install feed
to `main`. Release credentials stay in GitHub and are never written into the repository.

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

- `NPM_TOKEN` for the first `@agentstart/cli` publication. Create a granular npm token with read/write
  access to the `@agentstart` scope and publishing 2FA bypass. After the first release, configure npm
  Trusted Publishing with organization/user `xinyao27`, repository `agentstart`, workflow filename
  `daemon-release.yml`, no environment, and the `npm publish` action; remove the long-lived token only
  after one release succeeds through Trusted Publishing.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `MAC_CERTS`, and
  `MAC_CERTS_PASSWORD` for Developer ID signing and notarization.
- `POSTHOG_WRITE_KEY`, containing the PostHog Project API Key for the US project that receives
  product events and support reports. Every stable Rust target embeds this key at compile time; the
  workflow refuses to build when the secret is absent. Review that project's retention and deletion
  settings against `PRIVACY.md` before publishing.
- `CLOUDFLARE_API_TOKEN` for the AgentStart website Worker deploy. Create a token scoped to the
  Cloudflare account and `agentstart.ai` zone with the Workers deploy and DNS permissions required
  by Wrangler, then store it as a repository secret.
- `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_P8`, `APP_STORE_APP_ID`,
  `IOS_DIST_CERT_P12`, and `IOS_DIST_CERT_PASSWORD` for the iOS App Store archive. The expected
  AgentStart record is Apple ID `6810343597` with bundle ID `com.xinyao27.agentstart.mobile`.
  `APPLE_TEAM_ID` must be `8H6Q2YA365`. Store `ASC_API_KEY_P8`, `IOS_DIST_CERT_P12`, and
  `MAC_CERTS` as base64 without line breaks. The setup wizard performs these conversions when given
  the original files.

Before the first iOS archive, create the two App IDs and shared App Group with the capabilities
listed in [the mobile release guide](../../apps/mobile/RELEASE.md), and confirm App Store Connect app
`6810343597` uses the expected bundle ID. Fastlane creates fresh App Store provisioning profiles
from those portal identities during a release.

Create the `chrome-web-store` GitHub environment and store `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
`CWS_REFRESH_TOKEN`, and `CWS_PUBLISHER_ID` as environment secrets. The OAuth client must enable
the Chrome Web Store API and allow `https://developers.google.com/oauthplayground` as a redirect
URI. Add the Web Store owner as a test user, then set the external OAuth app to In production before
minting the CI refresh token; tokens issued while it remains in Testing expire after seven days.
Generate the refresh token with the `https://www.googleapis.com/auth/chromewebstore` scope.
The setup wizard restricts that environment to `extension-v*` tags. Add a required reviewer in
GitHub Settings if publication also needs a human approval gate; the tag restriction alone does not
provide reviewer approval.

The website deploy is independent of product releases. It runs from
`.github/workflows/web-deploy.yml`, uses the `CLOUDFLARE_API_TOKEN` repository secret, and deploys
the `agentstart-web` Worker configured in `apps/web/wrangler.jsonc` to the `agentstart.ai` and
`www.agentstart.ai` custom domains. Keep those routes and `SITE_ORIGIN` in sync if the domain ever
changes.

Preview the exact upload locally without publishing it:

```bash
vp run agentstart-web#build
vp run agentstart-web#deploy:dry-run
```

Chrome Web Store API v2 updates an existing item and cannot create one. If the item does not exist,
run `vp run @agentstart/extension#package:web-store:initial` and upload the generated
`agentstart-extension-<version>-initial-upload.zip` manually with `manifest.key` omitted. Chrome
then assigns the item ID and exposes its public key in the Package tab. Adopt that public key and ID
across the extension, Native Messaging, enterprise policy, release metadata, and CI before creating
the first tagged update. Once the item exists, confirm that the publisher owns it, complete its Store
listing and Privacy tabs, and manually publish any changed visibility setting once. The workflow
cannot create the item or complete those dashboard fields.

The package contains localized manifest names and short descriptions in English and Simplified
Chinese, plus the 128-pixel store icon. The submission guide contains ready-to-paste detailed
descriptions, purpose, category, URL, permission, remote-code, and data-use answers. Two synthetic
`1280x800` English screenshots and the required `440x280` small promotional tile are checked in under
`apps/extension/web-store/`. Before creating `extension-v0.1.0`, complete the durable checklist in
[chrome-web-store-submission.md](./chrome-web-store-submission.md) and reconcile it with the
[privacy form](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/), including:

- A detailed description, primary category, language and distribution choices, homepage URL, support
  URL, and the public `PRIVACY.md` URL. If both manifest locales are listed, keep their described
  feature sets consistent.
- A narrow single-purpose statement and a separate justification for every required permission,
  optional permission, required host permission, and optional host permission in `wxt.config.ts`.
  Confirm unused permissions are removed from the package before writing the answers.
- The remote-code declaration and every data-use checkbox and Limited Use certification, reconciled
  with the packaged MV3 output, its network destinations, and `PRIVACY.md`.
- Upload the checked-in full-bleed screenshots and small promotional tile after comparing them with
  the final packaged extension. A `1400x560` marquee tile and a YouTube promo video are optional.
  Add localized screenshots when their visible UI language differs; promotional tiles cannot be
  localized.

These dashboard materials are release blockers even when the extension package workflow succeeds;
the Web Store API submission does not create or review them.

## Prepare a release

Start from a clean `main` that exactly matches `origin/main`, with Rust 1.95, Node.js 24, and
Bun 1.4.0 installed (`prepare` compiles the daemon locally):

```bash
pnpm install --frozen-lockfile
pnpm release -- prepare 0.1.0
```

The command updates the workspace, daemon, computer-use helper, extension, macOS app, mobile
workspace package, and npm CLI versions; creates a header-only `docs/releases/<version>.md` draft
when one does not exist; builds the daemon for the current host; packages the Chrome extension; and
runs `pnpm check`. The iOS App Store `MARKETING_VERSION` in `apps/mobile/project.yml` remains
independently pinned to `1.0.0`. Finish the release notes, review the generated changes, commit them,
and push `main` using the commands printed at the end.

The daemon release workflow builds the seven `agentstart-rust-*` binaries on runners matching their
operating system and CPU, checksums, attests, and attaches them to a draft GitHub Release. It then
publishes npm, makes the verified GitHub Release public, renders the four-platform Homebrew formula
from the tagged template and exact downloaded artifacts, and finally creates or updates
`Formula/agentstart.rb` on `main` through the Contents API. Before the first successful release,
that live formula does not exist. Reruns leave a newer formula untouched and treat an identical
formula as complete. npm, Homebrew, and the curl installer all select `agentstart-rust-*`.

The native macOS app is the Developer ID distributed `AgentStart.dmg`, identified by
`com.xinyao27.agentstart.macos`. CI builds a universal app around the notarized daemon, signs the
nested executables and enclosing app, notarizes and staples the app, then signs, notarizes, and
staples the DMG. This path does not use an App Store Connect app record or an App Store provisioning
profile.

The explicit App ID `AgentStart macOS` (`com.xinyao27.agentstart.macos`) and its independent
macOS-only App Store Connect record were created on 2026-09-10. The record is named `AgentStart for
Mac`, uses SKU `agentstart-macos`, and has Apple ID `6810480610`; its
[Distribution page](https://appstoreconnect.apple.com/apps/6810480610/distribution) remains the
source of truth for account metadata. Do not add macOS to iOS Apple ID `6810343597`: Apple requires
an added platform to reuse that record's bundle ID, `com.xinyao27.agentstart.mobile`. The separate
record is identity preparation only. The current app has no App Sandbox entitlement, installs a
LaunchAgent and Chrome Native Messaging manifest, and gives the daemon arbitrary worktree, process,
Git, and PTY access, so it is not a Mac App Store upload. The exact account resources and minimum
independent target are documented in
[the Mac App Store release boundary](../../apps/macos/APP-STORE.md).

Before tagging, write the user-facing GitHub release body in
`docs/releases/<version>.md`. The first line must be `# AgentStart <version>` and at least one
non-heading body line must follow it. Describe behavior visible to Chrome, iOS, macOS, or CLI users;
omit implementation details and unreleased work. Review this file with the other release changes and
commit it before publishing. For example, `0.1.0` requires `docs/releases/0.1.0.md`; do not create
the tag until its real release content is known. Both the local publish preflight and tag workflow
reject a missing or empty versioned file, and the workflow passes that exact file to GitHub instead
of generating notes from pull-request titles.

## Publish

After the release commit is present on `origin/main`, run:

```bash
pnpm release -- publish 0.1.0 --ios-version 1.0.0
```

Type the version at the confirmation gate. The command verifies credentials and the reviewed
`docs/releases/0.1.0.md`, then creates and atomically pushes `v0.1.0`,
`extension-v0.1.0`, and `mobile-v1.0.0`. The daemon and extension tags trigger their release
workflows; the command dispatches the mobile workflow from the immutable mobile tag before starting
the first iOS TestFlight upload with marketing version `1.0.0`.
Every release that includes iOS requires an explicit `--ios-version`, so the App Store version train
cannot accidentally follow the daemon's independent version. The conductor passes this exact value
as the mobile workflow's required `release_version`, and the workflow rejects a value that differs
from its `mobile-v<version>` ref. The mobile workflow still treats the explicit `--ios-version` and matching immutable tag as its
release inputs; the checked-in project version is a consistency default rather than an authority.
The daemon is the runtime required by the Chrome extension and paired iOS app.

Skip one target when necessary:

```bash
pnpm release -- publish 0.1.0 --ios-version 1.0.0 --skip-extension
pnpm release -- publish 0.1.0 --ios-version 1.0.0 --skip-daemon
pnpm release -- publish 0.1.0 --skip-ios
```

The conductor can select the TestFlight audience:

```bash
pnpm release -- publish 0.1.0 --ios-version 1.0.0 --ios-distribution external \
  --ios-changelog 'Faster connections and lower resource usage.'
```

If a tag already exists at the current release commit, the command dispatches its workflow again
instead of recreating the tag. Registry publication is also idempotent: an existing npm version is
reported and skipped. The conductor reads only the requested remote tag refs and never overwrites
local tags. A requested local tag at another commit stops publication, while unrelated historical
tag conflicts do not block the live `origin/main` check.

Follow the latest workflow runs with:

```bash
pnpm release -- status 0.1.0 --ios-version 1.0.0
```

Status output queries the daemon, extension, and mobile workflows independently and reports only
runs whose refs exactly match `v0.1.0`, `extension-v0.1.0`, and `mobile-v1.0.0`.
