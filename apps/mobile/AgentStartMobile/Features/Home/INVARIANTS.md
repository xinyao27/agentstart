# Home invariants

## Entries

- The root route is the source for onboarding, the paired-host dashboard, activity insights,
  Settings, host details, Accounts, Pairing, Workspace creation, and deep-link workspace opens.
- A paired host renders its workspace, account-usage, activity, connection, and recent-workspace
  summaries from one `HomeSnapshot`; the view does not query repositories directly.
- Remove, reconnect, disconnect, host edit, and workspace creation actions stay in the owning Home
  model and route through the selected host's stable ID.

## State and persistence

- `HomeModel` owns hosts, connection snapshots, workspace/account/activity snapshots, account
  subscriptions, recent workspace state, and the cached offline snapshot. `HomeView` owns only
  presentation targets and clocks.
- Connected hosts refresh concurrently; disconnected hosts retain the last known snapshot and do
  not start workspace, account, or activity requests until the shared transport reports connected.
- Host removal clears host-scoped cached data, account subscriptions, recent-workspace state, and
  credentials through the repository. A failed removal keeps the host visible and reports an error.
- Successful refreshes persist the native snapshot and update the App Group widget snapshot. Legacy
  values are read only by the migration layer before the live model starts.

## Lifecycle and visual contract

- Observation, account streams, polling, and the minute clock cancel when the route disappears.
  Foreground and network recovery are owned by the shared transport runtime.
- Loading, empty, stale-cache, reconnecting, and failed states remain distinct. The global
  connection notice can be dismissed without removing the Home content.
- Home header actions use the same Hugeicons IDs, neutral color, 18-point glyph, and 44-point hit
  target as every other header. Workspace metrics, row spacing, and loader colors follow the
  shared Design System; decorative gradients are forbidden.
