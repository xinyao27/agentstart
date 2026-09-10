# Transport invariants

## Current product boundary

- The daemon and mobile client use authenticated direct `ws` / `wss` endpoints. AgentStart has no
  first-party Cloud Relay; the native client must not revive its deleted provisioning or
  credential lifecycle.
- Pairing continues to validate legacy relay fields because old QR payloads can still reach the
  boundary, but no relay secret is persisted and no relay connection is attempted.
- The daemon public key from the pairing offer remains pinned across every reconnect. A fresh
  ephemeral client key and nonce create a new E2EE session for every physical socket.

## Connection lifecycle

- One `RuntimeHostSession` owns each host's physical connection generation. Feature code never
  creates a WebSocket and concurrent unary calls share one authenticated peer.
- Reconnect delays are 0.5, 1, 2, 4, 8, 15, 30, and 60 seconds, capped at 12
  fast attempts, followed by one 90-second trickle attempt until recovery.
- Three consecutive explicit E2EE authentication rejections latch `authenticationFailed`.
  Network, timeout, malformed-frame, and protocol failures do not erase the saved pairing.
- Foreground activation and offline-to-online or interface changes wake the reconnect loop.
  A live socket is pinged first so a healthy connection is not replaced unnecessarily.
- A 20-second WebSocket heartbeat with an 8-second deadline detects half-open sockets. Failure
  invalidates exactly that connection generation; stale socket callbacks cannot replace or close
  a newer generation.

## Request and cancellation behavior

- One receive loop owns the encrypted stream and dispatches generated Protobuf frames by call ID.
  During migration it also routes recognized legacy frames, but new capabilities cannot depend on
  that path. Feature calls never race each other for `URLSessionWebSocketTask.receive()`.
- View cancellation removes its pending response waiter and is not displayed as an error. It does
  not tear down a healthy shared session used by another feature.
- A transport failure invalidates the peer and starts reconnection. Unary calls are not replayed
  automatically because a mutation may already have reached the daemon; each feature chooses
  whether its operation is safe to retry.
- The shared control connection requests a short-lived terminal bulk ticket. One host-scoped
  terminal multiplexer owns the authenticated binary socket, epoch, heartbeat, correlation IDs,
  and route allocation. Concurrent terminal sessions share it; closing one session releases only
  its route, while closing the final route closes the idle bulk connection. Renderer and feature
  code never read either socket.

## Persistence and diagnostics

- Host metadata lives in app storage; device tokens remain in this-device-only Keychain storage.
- Connection snapshots are value types. Platform actors publish them upward but do not own SwiftUI
  presentation state.
- User-visible phases distinguish connecting, reconnecting, unreachable, and authentication
  failure so recovery does not collapse into a generic offline label.
