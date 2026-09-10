# Diagnostics invariants

## Entries

- Settings opens Troubleshooting; Troubleshooting can start a diagnostic run or open the
  connection log without leaving the Settings navigation stack.
- A run checks stored hosts, internet reachability, every host WebSocket endpoint, and the iOS
  platform. The result order is stable and each row keeps its server-independent detail text.
- Common issues expand one row at a time. Expansion is local presentation state and does not
  trigger a runtime request.

## State and recovery

- `TroubleshootingModel` owns the run lifecycle. A second tap while a run is active is ignored;
  cancellation leaves the view usable and does not turn a partial run into success.
- Host-store and network failures become explicit warning/fail results. A malformed or unreachable
  endpoint is reported as unreachable, never as a successful check.
- Connection-log observation remains host-scoped and is cancelled when its destination disappears.

## Visual contract

- Diagnostic action groups use the shared Liquid Glass button contexts and the settings spacing
  scale; content rows remain ordinary settings surfaces.
- Running indicators use the Settings-owned neutral loader style. Status glyphs use semantic
  Hugeicons IDs and the shared success/attention/muted colors; no default blue chrome.
- Rows preserve the 44-point minimum hit target, readable detail alignment, and light,
  dark, Dynamic Type, and VoiceOver labels.
