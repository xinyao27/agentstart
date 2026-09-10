# Pairing invariants

- QR accepts only `agentstart://pair?code=…` and `agentstart://pair#…`; paste additionally accepts a bare
  base64url payload.
- Unknown JSON keys, invalid versions, malformed relay origins, expired invites, and relay/runtime
  scope mismatches fail closed before network access.
- A pairing attempt has a 25-second overall deadline and is cancelled when its screen disappears.
- A host is persisted only after WebSocket, E2EE v2, transcript binding, and device-token
  authentication all succeed.
- Device tokens live in a `ThisDeviceOnly` Keychain item. Host metadata never contains the token.
- Re-pairing the same daemon public key preserves its host identity and display name.
- Pairing authenticates the offer's direct endpoint. Legacy relay metadata is validated at the
  input boundary but is never persisted or used for a connection.
