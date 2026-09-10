# iOS release

The GitHub Actions workflow [mobile-release.yml](../../.github/workflows/mobile-release.yml)
builds the native SwiftUI app, signs the app and widget extension, verifies the resulting archive,
and uploads the IPA to TestFlight.

## Configured App Store identity

Every release targets the AgentStart App Store record configured by `APP_STORE_APP_ID`. Fastlane fails
closed when App Store Connect does not return this exact pair:

- Bundle ID: `com.xinyao27.agentstart.mobile`
- App Store record ID: `6810343597`, configured as the `APP_STORE_APP_ID` secret

Before the first signed archive, configure these identifiers in Apple Developer:

- Main App ID: `com.xinyao27.agentstart.mobile`, with App Groups enabled.
- Widget App ID: `com.xinyao27.agentstart.mobile.Widgets`, with App Groups enabled.
- App Group: `group.com.xinyao27.agentstart.mobile`, assigned to both App IDs.

Do not enable iCloud, Associated Domains, or Sign in with Apple on these App IDs. The app has no
matching entitlements or runtime integration for them. Add either side only when the product adopts
that capability.

Create or regenerate App Store provisioning profiles for both App IDs after configuring the portal
capabilities, and confirm that the signed profiles authorize the App Group entitlement.

Do not attach this release to any pre-AgentStart App ID, App Group, provisioning profile, or App
Store record. Remove obsolete identifiers and profiles in Apple
Developer after confirming that no retained product still uses them. Apple does not allow deleting
an explicit App ID after a build using it has been uploaded to App Store Connect; leave any such
locked record unused rather than referencing it from AgentStart.

## GitHub Actions inputs

The manual workflow requires `release_version`, an exact `x.y.z` iOS marketing version, and must be
dispatched from the matching immutable `mobile-v<version>` tag. The release conductor creates that
tag at the already-verified release commit and supplies the same version from its required
`--ios-version` option. The workflow rejects a mutable branch ref or a mismatched input before it
normalizes the value into `MOBILE_RELEASE_VERSION`, which Fastlane passes to every target in the
signed archive.
Direct Fastlane calls must likewise provide `version:x.y.z` or set `MOBILE_RELEASE_VERSION`; the
release lanes do not infer a version from project files or App Store history.

The version in `apps/mobile/package.json` follows the workspace release. The checked-in
`MARKETING_VERSION` in `project.yml` is the local development default and is pinned to `1.0.0` for
the first App Store release. The workflow still takes its release version only from the immutable
tag and matching input. The build number remains the highest integer build number in the configured
App Store record's TestFlight history plus one.

The remaining manual inputs are:

- `testflight_distribution`: upload for `internal` or `external` testers.
- `testflight_changelog`: release notes used for external TestFlight distribution.

If the resolved marketing-version train is already closed, the workflow stops before compiling.
Dispatch it again with an exact higher `release_version`.

For the first build of the new AgentStart App Store record, dispatch the workflow with
`release_version` set to `1.0.0`. The repository's pre-release package version does not need to be
the public App Store version; Fastlane passes the selected marketing version into the archive and
uses build number `1` when the new record has no build history.

## Required secrets

- `APPLE_TEAM_ID`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_API_KEY_P8`
- `APP_STORE_APP_ID`
- `IOS_DIST_CERT_P12`
- `IOS_DIST_CERT_PASSWORD`

The workflow validates all seven values before dependency installation or compilation. Fastlane then
checks the App Store identity and version train before creating the signed archive. Xcode's automatic
version management is disabled during export so the uploaded IPA retains the exact requested marketing
version and computed build number across the app and widget extension. The release lane verifies those
values, bundle identities, signed capabilities, and privacy manifests in both the archive and the final
IPA before upload.

## App Store publication

The workflow uploads to TestFlight; it does not submit a version for App Review. After Apple finishes
processing the build, App Store Connect still requires selecting that build on the configured app
version, completing compliance and metadata, and submitting it for review.

### Reviewable metadata

The English product-page draft lives in `fastlane/metadata/en-US/`. It currently contains the app
name, subtitle, description, keywords, privacy policy URL, support URL, marketing URL, and release
notes. Review those files against the shipped build before every submission. The release lane calls
`upload_to_testflight` only; it does not upload this directory to App Store Connect.

For the first `1.0.0` submission, complete and review Apple's
[required submission properties](https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties)
manually:

- Confirm the name, subtitle, description, keywords, primary language, primary and optional secondary
  category, copyright, content-rights declaration, and version release setting. `What's New` is not
  required for the first version; do not reuse the draft update notes as first-release marketing copy.
- Confirm the privacy policy and marketing URLs resolve publicly after the AgentStart repository
  changes reach `main`. Confirm that the support URL leads to a page where a customer can actually
  contact support; the current draft points to GitHub Issues.
- Complete App Privacy from the checked-in privacy manifests, `PRIVACY.md`, and a review of every
  shipped third-party SDK and network destination. A privacy manifest does not fill the App Store
  Connect questionnaire.
- Complete the age-rating questionnaire from actual app behavior. The app can display and interact
  with user-selected terminal, browser, repository, and agent content, so do not assume every content
  frequency or unrestricted-web-access answer is `None` without reviewing those surfaces.
- Provide App Review contact information, review notes, and any pairing instructions or temporary
  review access needed to reach the app's main features. Also finish availability, price, territory,
  agreement, tax, and Digital Services Act status that apply to the account.

The production screenshots are checked in under `fastlane/screenshots/en-US`: three 1320 × 2868
iPhone 6.9-inch images and three 2064 × 2752 iPad 13-inch images. They use a real paired Simulator
build with synthetic, non-sensitive projects, sessions, usage, and source changes. Keep every PNG
RGB-only with no alpha channel. Apple's
[screenshot requirements](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
allow one to ten per device class and scale the highest-resolution set to smaller devices. Use a real
paired release build whenever these screenshots are refreshed. App previews are optional.

### Export compliance

`project.yml` currently sets `ITSAppUsesNonExemptEncryption` to `false`, while the app uses platform
cryptography and an encrypted daemon transport. Before uploading the first build,
answer Apple's
[export-compliance questions](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance)
from the exact shipped cryptography and intended territories. Keep `false` only if those answers
confirm that no documentation is required. If Apple requires documentation, upload it, attach the
approval to the build, and add the issued compliance code to the app's Info.plist settings. Do not
submit a build on the current Boolean alone.
