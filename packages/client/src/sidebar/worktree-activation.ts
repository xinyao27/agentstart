import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { useAppStore } from '~renderer/store/state'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '~renderer/worktree/activation'

import { openSidebarWorkspace } from './host-navigation'

export function activateWorktreeFromSidebar(worktreeId: string): void {
  const worktree = useAppStore.getState().getKnownWorktreeById(worktreeId)
  if (worktree && openSidebarWorkspace({ projectId: worktree.repoId, worktreeId: worktree.id })) {
    return
  }
  const workspaceScope = parseWorkspaceKey(worktreeId)
  if (workspaceScope?.type === 'folder') {
    activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId)
    return
  }

  // Why: sidebar clicks already happen on a visible row; revealing again can
  // jump duplicate pinned/canonical entries back to the first mounted copy.
  activateAndRevealWorktree(worktreeId, { revealInSidebar: false })
}
