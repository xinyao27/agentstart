# Mac App Store release boundary

AgentStart has a real native macOS app today. The shipping product is the Developer ID signed and
notarized `AgentStart.dmg`; it is independent of the iOS App Store record and does not require an
App Store Connect record or an App Store provisioning profile.

The Mac App Store is a separate distribution target. No current AgentStart build is eligible for
upload there, and creating its App Store Connect record does not change that engineering status.

## App Store Connect record

Apple supports two ways to represent the Mac product:

| Route | Apple identity | Consequence | Decision |
| --- | --- | --- | --- |
| Add macOS to iOS Apple ID `6810343597` | `com.xinyao27.agentstart.mobile` | Apple requires every platform on the record to share its Apple ID, SKU, and bundle ID. The macOS target would have to abandon `com.xinyao27.agentstart.macos`. | Do not use. |
| Create a macOS-only record | `com.xinyao27.agentstart.macos` | Preserves the signed desktop identity and keeps the iOS and macOS release trains independent. | Created 2026-09-10. |

The second route uses these account resources under Apple team `8H6Q2YA365`:

1. **Completed 2026-09-10:** registered the explicit App ID `AgentStart macOS` with bundle ID
   `com.xinyao27.agentstart.macos` in Certificates, Identifiers & Profiles.
2. **Completed 2026-09-10:** created the independent macOS-only App Store Connect record:

   | Field | Verified value |
   | --- | --- |
   | Name | `AgentStart for Mac` |
   | Platform | macOS only |
   | Bundle ID | `com.xinyao27.agentstart.macos` |
   | SKU | `agentstart-macos` |
   | Apple ID | `6810480610` |
   | App Store version | `1.0` |

   Open its [Distribution page](https://appstoreconnect.apple.com/apps/6810480610/distribution).
   The installed app continues to display `AgentStart`. Before a future store submission, record
   and review the record's primary language and user-access selection with the remaining metadata.
3. Do not add macOS to Apple ID `6810343597`. That record is reserved for the iOS bundle
   `com.xinyao27.agentstart.mobile`.
4. Do not set a GitHub secret for the new numeric Apple ID yet. No workflow currently uploads a
   Mac App Store archive, so such a secret would imply a release path that does not exist.

Apple's [Add platforms documentation](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-platforms/)
states that an added macOS platform shares the iOS record's Apple ID, SKU, and bundle ID. Apple's
[App ID documentation](https://developer.apple.com/help/account/identifiers/register-an-app-id)
describes the explicit identifier that must match the target bundle ID.

## Signing and capability boundary

| Distribution | Signing and provisioning | Entitlements |
| --- | --- | --- |
| Current direct download | Developer ID Application; no App Store provisioning profile | The checked-in `entitlements.plist` is deliberately empty. Hardened Runtime is a signing option, not an App Sandbox entitlement. |
| Future Mac App Store target | Apple Distribution with a Mac App Store provisioning profile for `com.xinyao27.agentstart.macos` | A separate entitlement file must include App Sandbox and only the network and user-selected file access proven necessary by the store implementation. Its embedded runtime must also use sandbox inheritance. |

Do not add App Groups, iCloud, Associated Domains, Sign in with Apple, or other
services to the macOS App ID for the current DMG. A future target must add capabilities to its Xcode
configuration and enable the matching App ID capabilities only when its code uses them. Regenerate
the Mac App Store provisioning profile after any App ID capability change. Apple's
[capability documentation](https://developer.apple.com/help/account/identifiers/enable-app-capabilities/)
describes that profile invalidation requirement.

## Why the current app cannot be uploaded

Mac App Store apps must enable App Sandbox. The current direct-download app deliberately has an
empty `entitlements.plist`, and the bundled daemon relies on capabilities outside a store sandbox:

- `AgentStartMenuBar` launches `Contents/MacOS/agentstart` as a child process. For an App Store
  archive, Apple requires that embedded command-line tool to carry App Sandbox and sandbox
  inheritance entitlements, so it would inherit the app's restrictions.
- The daemon writes `~/Library/LaunchAgents/com.agentstart.daemon.plist` and controls it with
  `launchctl` to remain available when the menu app is closed.
- Native Messaging installation writes into Chrome's
  `~/Library/Application Support/Google/Chrome/NativeMessagingHosts` directory. Chrome later
  launches that same daemon executable directly as its native host.
- Local host capabilities read and write arbitrary workspace paths, discover executables from the
  user's home directory, read agent credentials and configuration, run Git and coding-agent
  processes, and create interactive PTYs. A store app can retain access to a folder chosen in an
  open panel with a security-scoped bookmark, but that does not grant general access to toolchains,
  credentials, sockets, repositories, and paths outside the selected folder.

These are product requirements, not missing entitlement checkboxes. Apple's
[App Sandbox documentation](https://developer.apple.com/documentation/security/app-sandbox)
requires the sandbox for Mac App Store distribution. Its
[file-access documentation](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox)
limits persistent external access to user-selected resources, and Apple's
[embedded-tool guidance](https://developer.apple.com/documentation/xcode/embedding-a-helper-tool-in-a-sandboxed-app)
requires a bundled command-line tool to inherit the containing app's sandbox.

## Minimum engineering split

Keep `apps/macos` and `daemon-release.yml` as the direct-download DMG path. A future store build
needs a separate Xcode target and workflow with these boundaries:

1. Move the reusable menu/status presentation into a Swift package that both macOS targets can
   consume. Keep distribution-specific installation behavior in each target.
2. Add a sandboxed macOS target for `com.xinyao27.agentstart.macos`, signed with Apple Distribution
   and archived as a Mac App Store product. Its app entitlement set must start with App Sandbox,
   outbound/inbound network access actually used by the transport, and read/write user-selected
   files. Its embedded runtime must be signed with only App Sandbox and sandbox inheritance as
   Apple requires.
3. Replace arbitrary path entry with `NSOpenPanel`, persist security-scoped bookmarks, and carry
   those scoped URLs through every local filesystem, Git, process, and PTY operation. Define what
   happens when an agent needs a credential, executable, socket, or file outside the selected
   workspace before claiming feature parity.
4. Remove the LaunchAgent and direct Chrome-manifest installation from the store target. Choose and
   implement one reviewable browser connection: a sandbox-compatible bundled extension and helper,
   a native workbench, or a separately installed Developer ID connector. The current Chrome native
   host cannot simply be re-signed with sandbox inheritance because Chrome launches it outside the
   containing app's process tree.
5. Add an App Store archive/upload workflow only after a sandboxed build can open a real workspace,
   run Git and an agent in a PTY, reconnect after relaunch, and communicate through the chosen
   browser path without sandbox violations. That workflow will need the new macOS numeric Apple ID,
   an Apple Distribution certificate, a Mac App Store provisioning profile, store metadata,
   screenshots, privacy answers, age rating, export-compliance answers, review notes, and account
   agreements.

## Xcode upload boundary

The current SwiftPM executable is assembled into `AgentStart.app` by
`scripts/build-macos-app.mjs`. It has no Xcode application target, archive scheme, asset catalog, or
App Store export configuration. `xcodebuild archive`, Organizer upload, and `notarytool` are not
interchangeable: notarization makes the Developer ID download acceptable to Gatekeeper, while App
Store Connect accepts an archive exported from an Apple Distribution signed App Store target.

The future target must provide all of the following before attaching a build to macOS version
`1.0` on Apple ID `6810480610`:

- an Xcode macOS app target whose product bundle identifier is
  `com.xinyao27.agentstart.macos`, with `MARKETING_VERSION` set to the submitted App Store version
  and a monotonically increasing `CURRENT_PROJECT_VERSION`;
- an `AppIcon.appiconset` containing the macOS representations required by Xcode. The current
  `AgentStart.icns` is complete for the Developer ID bundle, but is not an App Store asset catalog;
- separate App Store app and embedded-runtime entitlement files, the matching Mac App Store
  provisioning profile, and Apple Distribution signing. The direct-download empty entitlement file
  must remain scoped to the Developer ID build;
- an archive/export step that verifies the archive's application identifier, team identifier,
  sandbox entitlements, embedded provisioning profile, version, build number, and icon before
  upload;
- a required-reason API and privacy-manifest inventory for both the Swift host and embedded Rust
  runtime, followed by App Store Connect privacy answers that match the resulting product behavior.

Do not attach the current `AgentStart.app` or `AgentStart.dmg` to version `1.0`. They are direct
download artifacts and cannot become App Store artifacts by changing their certificate or adding
an entitlement after assembly.

Until that target exists, the App Store Connect record is a reserved product record. The releasable
macOS application remains the signed, notarized DMG.
