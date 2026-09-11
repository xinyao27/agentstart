# Lessons

- Do not describe repository gates, cross-platform builds, or compile-only simulator checks as
  complete end-to-end validation. State the exact verification boundary, explicitly note that this
  repository forbids retained tests, smoke checks, and E2E harnesses, and separate repository-ready
  status from unverified real-user flows and external publishing.
- When a visual correction is reported from a screenshot, inspect the owning feature and its
  neighboring surfaces against the style guide; fix the shared visual boundary and only extend the
  treatment to directly related inline panels, leaving edge-to-edge panes intentionally square.
