export type WorkspaceTabSelectionTarget = {
  dedicated?: boolean
  projectId: string
  worktreeId?: string
}

type WorkspaceTab = {
  url?: string
}

export function selectWorkspaceTab<T extends WorkspaceTab>(
  tabs: readonly T[],
  target: WorkspaceTabSelectionTarget
): T | undefined {
  const projectTabs = tabs.filter((tab) => workspaceTabProjectId(tab.url) === target.projectId)
  const mainTab = projectTabs.find((tab) => workspaceTabWorktreeId(tab.url) === null)
  if (!target.worktreeId) {
    return mainTab
  }
  const worktreeTab = projectTabs.find(
    (tab) => workspaceTabWorktreeId(tab.url) === target.worktreeId
  )
  return target.dedicated ? worktreeTab : (worktreeTab ?? mainTab)
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
