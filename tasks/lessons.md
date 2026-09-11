# Lessons

- Do not describe repository gates, cross-platform builds, or compile-only simulator checks as
  complete end-to-end validation. State the exact verification boundary, explicitly note that this
  repository forbids retained tests, smoke checks, and E2E harnesses, and separate repository-ready
  status from unverified real-user flows and external publishing.
- When a visual correction is reported from a screenshot, inspect the owning feature and its
  neighboring surfaces against the style guide; fix the shared visual boundary and only extend the
  treatment to directly related inline panels, leaving edge-to-edge panes intentionally square.
- For page-level visual corrections, inspect the outer content wrapper before changing individual
  cards; missing inset belongs on the page shell so the entire vertical rhythm moves together.
- When a shared session document contains both renderer-owned layout and daemon-owned terminal
  bindings, merge those fields by ownership; otherwise a harmless PTY update can surface as a
  recurring manual conflict even when no user edits actually collide.
- Keep an outer bootstrap rejection boundary around extension startup; any error after the
  connecting surface is replaced must still render actionable connection guidance instead of
  rejecting into a blank workspace root.
