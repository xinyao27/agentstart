# Terminal invariants

- The runtime terminal remains authoritative. SwiftTerm renders bytes and collects input; it does
  not invent terminal, tab, title, focus, clear, or close state.
- Terminal input is enabled only after the multiplex subscription is active and snapshot replay is
  complete.
- A `pending-handle` Session Tab may carry a `runtime:` handle reference or its original PTY ID.
  The native adapter adopts a handle only when the worktree-scoped live terminal list proves that
  exact referenced handle or PTY is connected; it never guesses from titles or tab order.
- When the initial active Session Tab is a pending terminal, it becomes an explicit pending
  selection and is activated immediately so the runtime can materialize its handle. Merely polling
  an unchanged pending snapshot is not recovery.
- Pending terminal activation is non-blocking session state: a stuck request cannot disable the
  tab strip or New Tab action. A newer selection invalidates the older activation response, while
  closing or creating a tab remains a serialized workspace mutation.
- Selecting or foregrounding a visible terminal focuses the matching runtime terminal before
  accepting user input.
- Rename, clear, display-mode, and close actions call the matching runtime capability. Clearing also
  resets the local emulator immediately so stale cells cannot remain visible.
- Session-owned terminals close through `session.tabs`; standalone terminals close through
  `terminal.close`.
- Session tab subscriptions, fallback polls, display-name reads, diff-comment metadata, host
  capability probes, and tab mutations only run while the host connection snapshot is connected.
  A disconnected session keeps its last rendered content without recreating the runtime until
  reconnection.
- Terminal chrome, action labels, icon geometry, accessory keys, spacing, and colors follow the
  current mobile design contract. Loaders and neutral actions never use the default blue tint.
- The accessory bar keeps the fixed sequence: Control, the user-ordered Escape/Tab pair, display
  mode, then the remaining visible keys and custom shortcuts. A fresh layout keeps every
  built-in key visible, including Backspace and Space; migrated layouts preserve the user's order.
- Terminal input, multiplex feed, and emulator mutation stay serialized across their actor or main
  actor boundaries.
