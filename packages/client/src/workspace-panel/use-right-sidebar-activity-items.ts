import { isFolderRepo } from '@yiru/protocol/project/repository'
import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { useRepoById } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'

import type { ActivityBarItem } from './activity-bar-buttons'
import { createRightSidebarActivityItems } from './right-sidebar-activity-items'
import { getVisibleRightSidebarActivityItems } from './right-sidebar-activity-visibility'

export function useRightSidebarActivityItems(worktreeId: string | null): {
  isFolderWorkspace: boolean
  items: ActivityBarItem[]
} {
  const explorerShortcut = useShortcutLabel('sidebar.explorer.toggle')
  const sourceControlShortcut = useShortcutLabel('sidebar.sourceControl.toggle')
  const portsShortcut = useShortcutLabel('sidebar.ports.toggle')
  const worktree = useAppStore((state) =>
    worktreeId ? (state.getKnownWorktreeById(worktreeId) ?? null) : null
  )
  const repo = useRepoById(worktree?.repoId ?? null)
  const workspaceScope = parseWorkspaceKey(worktreeId ?? '')
  const isFolderWorkspace = workspaceScope?.type === 'folder'
  const isFolder = isFolderWorkspace || (repo ? isFolderRepo(repo) : false)
  const items = (() => {
    if (worktreeId && !worktree) {
      return []
    }
    // Why: the mounted-but-closed sidebar intentionally drops its workspace
    // scope; retain the generic local entries so effective-tab resolution stays valid.
    return getVisibleRightSidebarActivityItems(
      createRightSidebarActivityItems({
        explorer: explorerShortcut,
        sourceControl: sourceControlShortcut,
        ports: portsShortcut
      }),
      { isFolder, isFolderWorkspace }
    )
  })()

  return { isFolderWorkspace, items }
}
