# AgentStart for macOS

A native menu bar host for the bundled Rust daemon. The daemon remains the authority for sessions,
terminals and connected clients. The app has no Dock window and requests no system permissions on
launch.

The browser extension remains the primary workbench so agents can use the user's real everyday
browsing context. The native app hosts the daemon and future permission flows; it does not embed a
replacement browser or move the workbench into a separate native window.

From the repository root:

```sh
pnpm exec vp run @agentstart/macos#build
open apps/macos/dist/AgentStart.app
```

Copy `AgentStart.app` to Applications before daily use. Launching the app installs Chrome Native Messaging
registration for the bundled daemon at its current location; reopen the app after moving it.
A local build uses an available Apple Development identity, falling back to an ad-hoc signature.
Neither local signature is a Developer ID signed and notarized distribution release.

`vp run @agentstart/macos#package:dmg` wraps the built app in the drag-to-Applications
`apps/macos/dist/AgentStart.dmg`. Both steps take their release identity from `AGENTSTART_MAC_RELEASE=1` plus
`AGENTSTART_MACOS_SIGN_IDENTITY`, which the `macos-app` release job supplies so the published image is
Developer ID signed, notarized, and stapled. That job assembles a universal bundle from the same
signed `agentstart-rust-darwin-arm64` and `agentstart-rust-darwin-x64` artifacts the release already
ships, then re-signs the universal nested executable as part of the app seal. The app carries no
separately compiled daemon copy. `apps/macos/package.json` owns the release version and every
assembled bundle is restamped from it, so the checked-in `Info.plist` version is only a SwiftPM
placeholder.

The menu reports an authenticated daemon handshake separately from a process that exists but does
not respond. Browser-client connectivity is visible in the extension. “Open AgentStart”
uses the default HTTPS browser and opens the installed extension workspace. Dia or Google Chrome must be
the default browser, with the AgentStart extension enabled in its active profile. The app cannot confirm
whether the browser displayed the extension page after accepting the open request.

The app reuses an existing daemon without claiming ownership. In that case quitting only closes the
menu bar. If the app started the daemon, quitting asks for confirmation and gracefully stops that
daemon, including its terminals and agents. Native Messaging starts this app when the bundled daemon
is absent. A daemon data-directory lock prevents competing launchers from creating two runtimes.

The stable app identifier is `com.xinyao27.agentstart.macos`. This provides a native application identity
for future permission flows; it does not transfer existing permissions. Computer Use currently
remains a separate `AgentStart Computer Use.app` with its own permission identity. No permission grant or
automatic login item is created here. Bundled daemon updates require replacement of the entire app;
the standalone daemon updater cannot replace executable code inside this signed bundle.

This identifier should use its own macOS-only App Store Connect record if AgentStart later ships
through the Mac App Store. It cannot be added to the existing iOS record because Apple requires
platforms on one record to share a bundle ID. The current app also cannot be uploaded unchanged:
see [APP-STORE.md](./APP-STORE.md) for the concrete sandbox gaps, account resources, and minimum
target split. The independent record is Apple ID `6810480610`; it reserves the product identity but
does not make the current target eligible for upload. The notarized DMG remains the releasable macOS
application until that separate target exists.

The menu bar template images and app icon preserve the original AgentStart desktop artwork, recovered
from its existing distributed app resources. They are checked into this package; building does not
read an installed copy of AgentStart.

The disk image installs the daemon, not the extension. Chrome can be told to fetch an extension at
install time, but only through an `external_update_url` pointing at a published Web Store item, and
Chrome has forbidden external installs from a local CRX on macOS and Windows since Chrome 33/44. So
until the AgentStart listing is published there is no auto-install path here at all, and even after it is,
macOS and Windows still show a confirmation the user must accept. The menu opens an already installed
extension; it does not claim to install one or infer installation from a saved flag.
