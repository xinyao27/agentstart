# PermissionFlow provenance

Source: https://github.com/jaywcjlove/PermissionFlow

Revision: `6d41004c4332a64798e2b0a25882a80a55d1ea15`

Snapshot reviewed: 2026-08-09

Yiru vendors the SystemSettingsKit, PermissionFlow, and
PermissionFlowScreenRecordingStatus source needed by Computer Use. Optional Bluetooth, Media,
Input Monitoring, Extended Status, Status Store, examples, documentation, and tests are not part
of the Yiru build.

The source is kept in Swift 5 language mode so the helper remains buildable by the macOS release
runner's Swift 6 toolchain. Yiru resolves System Settings through its bundle identifier instead of
the upstream absolute application path. PermissionFlow strings are hosted in Yiru's localized app
resources so the standalone helper does not depend on an adjacent SwiftPM resource bundle.

The floating panel preserves PermissionFlow's default layout and styling together with its
navigation, window tracking, launch animation, and native app drag source. Yiru's own permission
overview remains a separate host surface.
