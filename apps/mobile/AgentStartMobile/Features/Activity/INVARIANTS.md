# Activity Insights invariants

- The route opens from Home, the activity deep link, or the full-screen insights presentation;
  the leading close action returns to the previous route without changing Home state.
- Cached aggregate data remains visible while a host is reconnecting. A cold route waits for a
  connected host instead of issuing stats RPCs to saved but disconnected hosts.
- A cold route with no connected host renders the empty aggregate and remains dismissible; it
  never pins a full-screen loader while the global reconnect notice is available.
- `activityStats` is requested only for hosts whose `RuntimeConnectionSnapshot.phase` is
  `connected`; a connected transition refreshes the selected range, while disconnects preserve the
  last successful aggregate for the next retry.
- Tokens, API value, 7/30/90-day range, pull-to-refresh, foreground refresh, and the
  60-second focused refresh retain their UserDefaults preferences and share the Home usage range.
- A cancelled refresh never replaces a usable cache with an empty aggregate or a false failure;
  one unavailable host does not hide successful summaries from other connected hosts.
- Loaders use the global setting-selected neutral style. Charts, metrics, labels, and controls keep
  the mobile typography, spacing, and Hugeicons semantic IDs in light and dark appearance.
