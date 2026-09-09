export const PTY_SESSION_ID_SEPARATOR = '@@'
export const WORKTREE_ID_SEPARATOR = '::'

export function parsePtySessionId(sessionId: string): { worktreeId: string | null } {
  const idx = sessionId.lastIndexOf(PTY_SESSION_ID_SEPARATOR)
  if (idx <= 0) {
    return { worktreeId: null }
  }
  const candidate = sessionId.slice(0, idx)
  // Why: require non-empty halves on both sides of `::` so degenerate
  // ids like `::@@…`, `repo::@@…`, or `::path@@…` don't synthesize a
  // phantom worktreeId for memory attribution.
  const sepIdx = candidate.indexOf(WORKTREE_ID_SEPARATOR)
  if (sepIdx <= 0 || sepIdx + WORKTREE_ID_SEPARATOR.length >= candidate.length) {
    return { worktreeId: null }
  }
  return { worktreeId: candidate }
}

export const ORPHAN_WORKTREE_ID = '__orphan__'
