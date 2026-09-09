# Agent Session History invariants

- The Workspace action exists only when the host advertises `aiVault.protobuf.v1`, the typed
  `AiVaultService.ListSessions` availability probe.
- Workspace scope includes only the active worktree path; Project scope additionally includes
  same-repository sibling worktrees; All sends no scope hint and performs no client narrowing.
- Refresh bypasses the host cache. Scope changes reuse it.
- Search covers title, session id, agent, cwd, file path, and every visible preview message.
- Rows use a 16pt agent mark, 14pt title, 12pt metadata, hairline separator, and gray
  loader. Expanded rows render at most the five most recent conversation turns.
- Resume must create and activate a real terminal with the host-provided resume command. A failed
  create never reports success or navigates to the session.
- Loading, unsupported, error, empty, skipped-transcript, resuming, disconnected, and cancellation
  states remain distinct.
