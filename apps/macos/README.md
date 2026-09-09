# Yiru for macOS

A native menu bar host for the bundled Rust daemon. The daemon remains the authority for sessions,
terminals and connected clients. The app has no Dock window and requests no system permissions on
launch.

The browser extension remains the primary workbench so agents can use the user's real everyday
browsing context. The native app hosts the daemon and future permission flows; it does not embed a
replacement browser or move the workbench into a separate native window.

From the repository root:

```sh
pnpm exec vp run @yiru/macos#build
open apps/macos/dist/Yiru.app
```

Copy `Yiru.app` to Applications before daily use. Launching the app installs Chrome Native Messaging
registration for the bundled daemon at its current location; reopen the app after moving it.
The generated app is locally ad-hoc signed, not notarized or a distribution release.

The menu reports an authenticated daemon handshake separately from a process that exists but does
not respond. Browser-client connectivity is visible in the extension. “Open Yiru”
uses the default HTTPS browser and opens the installed extension workspace. Dia or Google Chrome must be
the default browser, with the Yiru extension enabled in its active profile. The app cannot confirm
whether the browser displayed the extension page after accepting the open request.

The app reuses an existing daemon without claiming ownership. In that case quitting only closes the
menu bar. If the app started the daemon, quitting asks for confirmation and gracefully stops that
daemon, including its terminals and agents. Native Messaging starts this app when the bundled daemon
is absent. A daemon data-directory lock prevents competing launchers from creating two runtimes.

The stable app identifier is `com.xinyao27.yiru.macos`. This provides a native application identity
for future permission flows; it does not transfer existing permissions. Computer Use currently
remains a separate `Yiru Computer Use.app` with its own permission identity. No permission grant or
automatic login item is created here. Bundled daemon updates require replacement of the entire app;
the standalone daemon updater cannot replace executable code inside this signed bundle.

The menu bar template images and app icon preserve the original Yiru desktop artwork, recovered
from its existing distributed app resources. They are checked into this package; building does not
read an installed copy of Yiru.

This local package is not yet a one-step consumer installer: a publicly available browser-extension
listing and a signed, notarized app distribution still need release verification. The menu opens an
already installed extension; it does not claim to install one or infer installation from a saved flag.
