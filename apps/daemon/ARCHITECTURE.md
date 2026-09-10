# Rust daemon architecture

The runtime, CLI, Native Messaging host, adapters, and authoritative state live in this package.
The published binary and installation identities remain stable across the implementation change.

## Client ownership

Chrome and iOS are independent, first-class clients of the same daemon. Closing either client does
not transfer or destroy terminal/session authority. The daemon owns durable tabs, terminal bindings,
workspace sleep/wake, and session revisions. Each client retains its own selection and focus;
receiving a snapshot does not authorize moving another client's focus. Browser operations still
require the authenticated Chrome host that owns those pages.

Session document writes compare the expected persistent epoch/revision inside the authority lock.
Chrome merges pending edits against versioned snapshots and suppresses persistence during snapshot
projection. SessionTabs publication has a daemon-lifetime epoch and a monotonic sequence covering
terminal, document, and browser facts; that publication identity is separate from the persisted
session document version. Neither authorization nor grant scope is broadened by client parity.

## Decision

The lifecycle composes capability authorities and owns session admission and shutdown. Private
handlers use generated typed method descriptors. Shared transport code enforces authentication,
authorization, deadlines, cancellation and resource limits before domain effects.

```rust
pub struct Runtime { /* private Implementation */ }
pub struct AuthenticatedChannel { /* sealed transport session */ }

impl Runtime {
    pub async fn open(config: RuntimeConfig) -> Result<(Self, RuntimeReady), RuntimeFault>;
    pub fn attach(&self, channel: AuthenticatedChannel) -> Result<SessionHandle, RuntimeFault>;
    pub async fn shutdown(self, reason: ShutdownReason) -> Result<ShutdownReport, RuntimeFault>;
}
```

`AuthenticatedChannel` can only be created by a transport Adapter after its transport-specific
origin, protocol, authentication, encryption, frame-size, and rate-limit checks pass. Every RPC is
then authorized again from generated access metadata.

## Module shape

```text
src/
  entry.rs                 multicall executable frontend
  protocol.rs              generated method policy and typed route identity
  runtime.rs / runtime/    composition, lifecycle, readiness, shutdown
  rpc/                     admission, authorization, errors, dispatch
  <capability>/             vertical domain Modules named for their authority
  hosts/                   Local, WSL, SSH Adapters and narrow private facets
  transport/               authenticated Chrome WebSocket and artifact HTTP
  mobile/                  paired-device authority and iOS E2EE WebSocket
  native_messaging/        Chrome Native Messaging framing, bootstrap, install
  persistence/             concrete SQLite/profile stores and migrations
```

Capability authorities such as `clipboard/`, `projects/`, and `update/` live at the source root.
The composition root mounts their wire adapters in `rpc/`; authority state and effects stay with
the feature. Transport admits only methods listed in generated protocol policy.

## Seams and Adapters

- In-process parsing, normalization, reducers, and revision decisions stay concrete. They do not
  get an Adapter.
- Local-substitutable effects use narrow private filesystem, process, PTY, and path-dialect Seams.
  Local, WSL, and SSH are the production Adapters. Git is one Module built over those effects, so
  Git 2.25 fallback and host-scoped capability caching do not fork three times.
- Remote-owned Adapters are Chrome WebSocket, Chrome reverse calls, iOS encrypted WebSocket,
  and Native Messaging bootstrap.
- True external Adapters are GitHub, agent CLIs, PostHog, and release feeds.
- SQLite and profile JSON are concrete hidden stores, not interchangeable repository Interfaces.

## Ordering and ownership invariants

Request order is:

```text
frame limit → transport authentication/E2EE → protocol route → access authorization
→ typed decode → deadline/cancellation → resource ordering
→ domain mutation → atomic persistence/event append → encode → backpressure
```

- One state aggregate has one authoritative writer for its database, PTY session, revision scope,
  or pairing registry.
- Profile state and installation state use separate SQLite actors. `profiles/<id>/agentstart.sqlite`
  contains project/worktree/session state; `agentstart-installation.sqlite` contains only mobile devices,
  mobile notification replay, and the dangerous-approval credential. Runtime Environment grants
  and keys are installation-scoped secure-file state, while the active selection remains in each
  profile's settings.
- Revision and event append commit in one SQLite transaction; publication happens after commit.
- A subscription performs cursor replay and then joins live delivery without a gap.
- All path semantics, Git feature results, CLI discovery, and PTY identity are scoped by Host ID.
- Mobile E2EE keeps exact transcript bytes, canonical Base64, direction keys, monotonic counters,
  replay rejection, and serialized inbound processing.
- Terminal output keeps per-stream byte, resize, signal, and exit ordering with bounded buffers.

Startup acquires single-instance ownership, migrates persistence, restores authority, constructs
Adapters and Modules, binds both client transports, and only then atomically publishes readiness.
Shutdown withdraws readiness, stops admission, cancels active calls and sessions, reaps PTYs and
process groups, flushes best-effort remotes, checkpoints persistence, and releases the process lock.

## Error and performance contracts

Domain Modules return narrow errors. The RPC boundary maps them to stable wire codes covering
invalid input, unauthorized, forbidden, not found, revision conflict, unsupported host capability,
busy/unavailable, timeout, cancellation, external provider failure, and internal incident ID.
Tokens, environment variables, raw commands, remote paths, stderr, and provider payloads never cross
the wire by default.

- Route lookup is O(1); protobuf payloads decode directly into generated types.
- No pure read implicitly spawns a process or repeats a Host probe.
- External I/O never holds a state lock across `await`.
- SQLite uses WAL, prepared statements, short transactions, and serialized writes only where event
  ordering requires it.
- PTY, artifact, and large file traffic is bounded and streamed with byte buffers.
- Diagnostics coalesces concurrent memory polls into one bounded cross-platform process-table
  capture; its state lock is used only for CPU baselines and the 60-point history ring.
- Authenticated sessions, active requests, outbound frames, binary routes, and temporary tickets
  each have independent count and byte limits; overload closes only the offending connection.
- HTTP initializes its Ring TLS provider and pooled client only when a network capability is first
  used, so offline startup does not pay the crypto or connection-pool idle cost.
- SSH work is batched; connection reuse may be added behind the Adapter without changing callers.
- Notifications and telemetry stay off the interactive request path.

## Acceptance and maintenance

The runtime implementation and CLI live in this package. Capability policy and generated
cross-language bindings come from `packages/protocol`; browser effects remain in the extension.
Each capability change updates its schema, owning authority, and actual callers together.

Use `PARITY.md` for behavior evidence and remaining platform acceptance, and `HANDOFF.md` for
current execution ownership and unfinished checks. Builds establish compilation and packaging;
interactive acceptance must exercise the real client and destination host.
