# Files invariants

- Runtime file capabilities and this invariant ledger are the behavioral source of truth.
- Root and nested directories load independently; a nested failure never blanks an already loaded tree.
- Reconnect and refresh keep cached rows visible. Cold-load failures alone use the full-screen error state.
- Directory RPCs and nested retries only run while the host connection snapshot is connected. A cold
  disconnected route shows the host-disconnected state; a loaded tree remains browsable until reconnection.
- Worktree file and terminal-artifact previews use the same connection gate. Existing document content
  and dirty artifact drafts stay visible during a disconnect; retry/save waits for reconnection.
- `.git` and `node_modules` never appear. Directories sort before files, then by localized name.
- Text, Markdown, HTML, and supported images open a preview. Unsupported binary rows remain visible but disabled.
- All loaders use the semantic muted foreground color. Rows retain the 44-point height, 16-point
  indentation step, 16-point chevron, 17-point file icon, 14-point title, and gray disabled detail.
- The legacy capped `files.list` response remains a fallback for hosts without `files.readDir`, including its
  “Showing first 5000” disclosure.
