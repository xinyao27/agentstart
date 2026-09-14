export type WorkspaceTabSelectionTarget = {
  projectId: string
  worktreeId?: string
}

type WorkspaceTab = {
  active?: boolean
  index: number
  lastAccessed?: number
  url?: string
}

// Why: one browser tab per worktree is the model. A worktree request matches
// that worktree's own tabs only — falling back to the project's tab would
// repurpose work the user is already doing, so the caller opens a tab instead.
export function selectWorkspaceTab<T extends WorkspaceTab>(
  tabs: readonly T[],
  target: WorkspaceTabSelectionTarget
): T | undefined {
  const worktreeId = target.worktreeId ?? null
  return mostRecentlyUsedTab(
    tabs.filter(
      (tab) =>
        workspaceTabProjectId(tab.url) === target.projectId &&
        workspaceTabWorktreeId(tab.url) === worktreeId
    )
  )
}

// Why: duplicate tabs for one worktree are legal, so query order cannot decide
// which one a request means — the tab the user touched last does.
export function mostRecentlyUsedTab<T extends WorkspaceTab>(tabs: readonly T[]): T | undefined {
  return (
    tabs.find((tab) => tab.active === true) ??
    tabs.toSorted(
      (left, right) =>
        (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0) || right.index - left.index
    )[0]
  )
}

// Why: a tab already showing the target must be focused, not re-navigated.
// Reloading it would discard the terminals and editor buffers that make one
// tab per worktree worth having.
export function isSameWorkspaceUrl(current: string | undefined, target: string): boolean {
  return (
    workspaceTabSearchParam(current, 'project') === workspaceTabSearchParam(target, 'project') &&
    workspaceTabSearchParam(current, 'worktree') === workspaceTabSearchParam(target, 'worktree') &&
    workspaceTabSearchParam(current, 'session') === workspaceTabSearchParam(target, 'session')
  )
}

export function workspaceTabProjectId(url: string | undefined): string | null {
  return workspaceTabSearchParam(url, 'project')
}

function workspaceTabWorktreeId(url: string | undefined): string | null {
  return workspaceTabSearchParam(url, 'worktree')
}

function workspaceTabSearchParam(url: string | undefined, name: string): string | null {
  if (!url) {
    return null
  }
  try {
    return new URL(url).searchParams.get(name)
  } catch {
    return null
  }
}
