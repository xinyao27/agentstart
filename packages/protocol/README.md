# `@agentstart/protocol`

This package is the single protocol definition shared by the AgentStart daemon, Chrome extension, and
iOS app. Its `proto/` tree is authoritative; generated TypeScript, Rust, and Swift bindings are
artifacts of that schema rather than independently maintained contracts.

## Boundaries

- `proto/agentstart/protocol/v1/` owns transport frames, canonical statuses, and method policy metadata.
- `proto/agentstart/runtime/v1/` owns typed runtime services and their request and response messages.
- `typescript/`, `rust/`, and `swift/` contain language bindings and transport-neutral facades.
- Authentication, WebSocket lifecycle, and mobile E2EE stay in their owning applications.

The primary transport prefixes each serialized `agentstart.protocol.v1.Frame` with ASCII `AGENTSTART` and its
one-byte generated protocol version, then carries it over an authenticated, ordered WebSocket. The
preamble makes protocol frames deterministic to route while the legacy binary channels are being
removed. Calls use full protobuf method paths, for example
`/agent_start.runtime.v1.StatusService/GetStatus`. `Payload.data` carries a complete typed protobuf
message. Credit is measured only in payload bytes and replenished per call; cancel and timeout
terminate only their addressed call.

Optional transport behavior is negotiated through `Hello.supported_transport_features` and
`Welcome.enabled_transport_features`. A `CallStart.destination` is valid only when routed calls
were negotiated; an absent destination always means the connected daemon. A runtime-environment
destination is the canonical saved environment ID, never a mutable display name or selector. The
connected daemon authorizes the source as `LOCAL` over `CHROME_EXTENSION`, while the destination
daemon independently authorizes the forwarded call as `RUNTIME` over `DAEMON`; a routable method
must permit both ends. Every RPC declares both authorization policy and transport policy.
Generation fails when either policy is missing, so a method cannot silently inherit routing or
stream-reconnect behavior.

Chrome extension peers may also negotiate reverse calls on the same authenticated socket. Daemon
calls use even IDs and no destination; the extension accepts only methods registered from generated
protobuf descriptors. The legacy shell-services link remains mounted until every production
handler has an equivalent typed method and caller, so the transport migration cannot remove live
behavior piecemeal.

## Migration invariant

A capability is migrated as one complete vertical slice. The same change that moves its final
caller to `@agentstart/protocol` removes the old caller adapter, route, contract, generated binding,
capability advertisement, and transport-only dependency. A compatibility path may exist only while
an identified production caller still uses it; it is not a permanent fallback or a place to retain
dead code. Do not mark a capability migrated until a repository-wide symbol scan finds no remaining
old entry point.

## Schema changes

Run `vp run @agentstart/protocol#generate` after changing a schema. Run the package `lint`, `build`, and
`typecheck` tasks before committing generated artifacts. Preserve field numbers and names, reserve
removed fields, and create a new versioned protobuf package for a breaking change.
