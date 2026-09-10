# Host invariants

## Identity and storage

- A Host ID and pinned daemon public key survive name and endpoint edits; editing never re-pairs.
- Name and endpoint are written in one metadata commit. A missing or concurrently removed Host
  fails instead of silently recreating a profile.
- Removing a Host commits metadata first, records a durable credential cleanup intent, then deletes
  the Keychain token. A locked Keychain cannot resurrect the removed profile.
- Keychain tokens remain `whenUnlockedThisDeviceOnly` and never enter UserDefaults or logs.

## Connections

- Reconnect replaces a session when the stored endpoint changed and retains the paired token.
- Disconnect closes control and terminal transports and removes the Host connection snapshot.
- Removing a Host closes its transports only after metadata removal succeeds.
- Host rows remain keyed by stable Host ID across rename, reconnect and sorting.

## Endpoint editing

- Accept bare host, host:port, bracketed or bare IPv6, and complete `ws://` or `wss://` endpoints.
- Missing scheme and port inherit the current scheme and port, falling back to `ws` and `6768`.
- Reject credentials, path, query, fragment, malformed DNS labels, non-canonical IPv4 and ports
  outside 1–65535 rather than silently stripping them.
- Saving an endpoint change dismisses after the metadata commit; reconnect is a follow-on side
  effect and cannot turn a committed save into a visible failure.

## Visual contract

- Host actions use the established reconnect, disconnect, edit and delete icon semantics.
- Edit copy uses 12/14pt type, 44pt fields, consistent spacing and a neutral loader.
- Functional fields use interactive iOS 26 Liquid Glass. Save, actions and loaders remain neutral,
  never blue.
