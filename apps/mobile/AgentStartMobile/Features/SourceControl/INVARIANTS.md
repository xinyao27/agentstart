# Source Control invariants

- Runtime git operations always use the selected worktree ID and execute serially.
- Source Control status, branch comparison, commit history, hosted-review reads, and every Git or
  review mutation run only while the selected host is connected; a cached screen remains visible
  during reconnect and cold routes show the host-disconnected state.
- A refresh never clears an already rendered status snapshot.
- A base-branch or committed-branch comparison failure stays in the `Committed on Branch`
  section; it must not become the global action alert that is reserved for mutations.
- Unresolved conflicts cannot be staged, discarded, or opened as a stable diff.
- Discard is destructive and always requires explicit confirmation.
- File and section ordering are stable and match the current mobile Source Control contract.
- Failed-check and conflict AI triage each create one fresh workspace terminal, send one guarded
  prompt, reject duplicate launches, and surface a locked-input or transport failure.
- Pull-request comment audience filters combine provider bot metadata, the legacy login heuristics,
  and the runtime's `prBotAuthorOverrides` setting.
- Progress indicators and ordinary actions use neutral foreground colors, never blue tint.
