import { folderWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { RefObject } from 'react'
import { useAppStore } from '~renderer/store/state'

import { runWorktreeBatchDelete, runWorktreeDelete } from '../delete-worktree/flow'
import { runSleepWorktrees } from '../sleep-worktree-flow'
import { prepareDeleteSiblingPositionRestore } from './delete-position'
import type { WorktreeContextMenuState } from './state'

export function useLifecycleMenuActions(args: {
  state: WorktreeContextMenuState
  scopeRef: RefObject<HTMLDivElement | null>
  setMenuOpenState: (open: boolean) => void
}) {
  const { state, scopeRef, setMenuOpenState } = args
  const { batchDeleteWorktrees, folderWorkspaceId, isMultiContext, sleepableWorktrees, worktree } =
    state
  const deleteFolderWorkspace = useAppStore((store) => store.deleteFolderWorkspace)
  const setActiveWorktree = useAppStore((store) => store.setActiveWorktree)

  const handleCloseTerminals = () => {
    const worktreeIds = sleepableWorktrees.map((item) => item.id)
    setMenuOpenState(false)
    // Why: Sleep can remount the sidebar when it clears the active workspace.
    // Let the menu finish closing before starting that remount.
    window.setTimeout(() => {
      void runSleepWorktrees(worktreeIds)
    }, 50)
  }

  const handleDelete = () => {
    const restoreSidebarPosition = prepareDeleteSiblingPositionRestore(scopeRef.current)
    setMenuOpenState(false)
    // Why: Delete can remove the active row and remount the sidebar. Run it
    // after menu close for the same reason as Sleep above.
    window.setTimeout(() => {
      if (isMultiContext) {
        runWorktreeBatchDelete(batchDeleteWorktrees.map((item) => item.id))
        restoreSidebarPosition()
        return
      }
      if (folderWorkspaceId) {
        void deleteFolderWorkspace(folderWorkspaceId).then((deleted) => {
          if (
            deleted &&
            useAppStore.getState().activeWorktreeId === folderWorkspaceKey(folderWorkspaceId)
          ) {
            setActiveWorktree(null)
          }
        })
        restoreSidebarPosition()
        return
      }
      runWorktreeDelete(worktree.id)
      restoreSidebarPosition()
    }, 50)
  }

  return { handleCloseTerminals, handleDelete }
}

export type LifecycleMenuActions = ReturnType<typeof useLifecycleMenuActions>
