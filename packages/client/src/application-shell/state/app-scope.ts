// Why: a page opened before any workspace exists still needs a queue to belong
// to. The app scope is that queue — a reserved worktree id whose root group
// holds page tabs, so the titlebar strip always has a real host and there is no
// second, page-only render path beside the hosted one.
//
// Why a reserved id and not a nullable worktree: `Tab.worktreeId` and
// `TabGroup.worktreeId` are required, and every queue operation (create, close,
// reorder, activate) already keys on that id. A sentinel keeps page tabs inside
// the one tab model instead of beside it. Real worktree ids are UUIDs, so this
// value cannot collide.
export const APP_SCOPE_WORKTREE_ID = 'app-scope'

/** True when the id is the app scope rather than a real workspace. */
export function isAppScope(worktreeId: string | null | undefined): boolean {
  return worktreeId === APP_SCOPE_WORKTREE_ID
}

/** The scope a page tab belongs to: the active workspace, else the app scope. */
export function pageTabScope(activeWorktreeId: string | null): string {
  return activeWorktreeId ?? APP_SCOPE_WORKTREE_ID
}
