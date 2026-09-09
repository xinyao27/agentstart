# iOS Simulator development

Applies to the native SwiftUI app in [`apps/mobile`](../../apps/mobile). Mobile pairs
directly with the daemon over an authenticated, end-to-end encrypted WebSocket, without another
Yiru client in the path.

## Development flow

Run:

```sh
vp run yiru-mobile#dev
```

The task builds the current-platform daemon binary, generates the Xcode project, builds and launches
the Simulator app, starts or reuses the daemon, and passes a short-lived pairing link to the debug
app. Its implementation lives in
[`apps/mobile/scripts/start-development.mjs`](../../apps/mobile/scripts/start-development.mjs).

To pair manually, open **Yiru Mobile** from the Chrome side panel and scan its QR code. The same offer
can be generated from the CLI:

```sh
apps/daemon/target/release/yiru mobile pair \
  --address 127.0.0.1 \
  --device-name 'iOS Simulator' \
  --json
```

Open the returned `yiru://` link in a booted Simulator with `xcrun simctl openurl booted '<url>'`.

## Connection ownership

| Piece | Where it lives |
| --- | --- |
| Direct mobile listener and pairing offer | [`apps/daemon/src/mobile`](../../apps/daemon/src/mobile) |
| Pairing URL / QR page | [`page.tsx`](../../packages/client/src/mobile/page.tsx) |
| Deep-link decoding and confirmation | [`Features/Pairing`](../../apps/mobile/YiruMobile/Features/Pairing) |
| Host profile persistence | [`KeychainHostRepository.swift`](../../apps/mobile/YiruMobile/Platform/Persistence/KeychainHostRepository.swift) |
| Authenticated socket and E2EE handshake | [`Platform/Runtime`](../../apps/mobile/YiruMobile/Platform/Runtime) |

The phone stores the selected endpoint, pinned daemon public key, and device credential in its
Keychain. Changing the endpoint does not silently change identity; a rejected key or credential
requires explicit re-pairing.

## Address rules

| Situation | Address to advertise |
| --- | --- |
| Simulator on the same Mac | `127.0.0.1` |
| Physical iPhone on the same LAN | The daemon host's LAN address |
| Tailscale / private overlay | The reachable tailnet address or hostname |

Never advertise `127.0.0.1` to a physical phone: it means the phone itself. Pass a port in
`--address` only when overriding the daemon's printed mobile port.

## iOS network policy

[`apps/mobile/project.yml`](../../apps/mobile/project.yml) declares local-network usage,
local ATS networking, camera access for the QR scanner, and the `yiru` deep-link scheme. Simulator
does not exercise the physical device's Local Network Privacy prompt, so a successful Simulator
pair verifies reachability, credential exchange, E2EE, and UI behavior but not the permission-denied
path on real hardware.

## Common failures

- **The pairing URL has `0.0.0.0`.** That is a bind address, not a destination. Generate the offer
  with `--address` set to a concrete LAN or tailnet address.
- **Connection timeout.** Check reachability to the printed mobile port and iOS Local Network
  permission. Tailscale must be active on both peers for a tailnet address.
- **Authentication failed.** Re-pair. Do not hand-edit a key or device credential.
- **Protocol version screen.** Update the daemon binary or Yiru Mobile as directed; the clients
  negotiate versions explicitly and do not guess compatibility.
