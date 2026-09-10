# Widgets invariants

## Snapshot boundary

- Home is the sole producer of the native widget snapshot. `WidgetSnapshotWriter` converts the
  latest Home snapshot into provider and token-usage values, then reloads WidgetKit timelines.
- The App Group snapshot is value-only and contains no credentials or live transport handles. A
  widget can render stale data or a fallback URL without waking the host connection.
- Snapshot values and App Group persistence stay in `Shared/Widgets`; the feature writer only maps
  current Home domain values and stable deep-link paths.

## Selection and ordering

- Claude and Codex provider widgets select the newest available host usage. Token totals use the
  user's current calendar week and today keys.
- Missing data is represented as nil/zero presentation values with a safe app URL; it is never
  fabricated from a previous host or a different provider.

## Visual and lifecycle contract

- The three WidgetKit surfaces own their compact/medium/large layouts and container backgrounds;
  they do not reuse mobile navigation chrome or open a daemon connection.
- Widget colors are semantic to the widget surface and must remain legible in light/dark mode. The
  mobile app's neutral loader and Hugeicons rules apply to the producer and deep-link chrome, not
  to replacing WidgetKit's status color semantics.
