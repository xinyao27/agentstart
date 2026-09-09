export type WorkspaceScope =
  | { type: 'worktree'; worktreeId: string }
  | { type: 'folder'; folderWorkspaceId: string }
export type WorkspaceKey = `worktree:${string}` | `folder:${string}`

export function worktreeWorkspaceKey(worktreeId: string): WorkspaceKey {
  return `worktree:${worktreeId}`
}

export function folderWorkspaceKey(folderWorkspaceId: string): WorkspaceKey {
  return `folder:${folderWorkspaceId}`
}

export function parseWorkspaceKey(value: string): WorkspaceScope | null {
  if (value.startsWith('worktree:')) {
    const worktreeId = value.slice('worktree:'.length)
    return worktreeId.length > 0 ? { type: 'worktree', worktreeId } : null
  }
  if (value.startsWith('folder:')) {
    const folderWorkspaceId = value.slice('folder:'.length)
    return folderWorkspaceId.length > 0 ? { type: 'folder', folderWorkspaceId } : null
  }
  return null
}

export function isWorkspaceKey(value: string): value is WorkspaceKey {
  return parseWorkspaceKey(value) !== null
}
