import { useState } from 'react'
import { shellClient } from '~renderer/runtime/shell-client'
import { hasSidebarHostNavigation, openSidebarWorkspace } from '~renderer/sidebar/host-navigation'
import { useAppStore } from '~renderer/store/state'

import { getWorkspaceStatus } from '../workspace-status'
import type { WorktreeContextMenuState } from './state'

export function useWorkspaceMenuActions(args: {
  state: WorktreeContextMenuState
  setMenuOpenState: (open: boolean) => void
}) {
  const { state, setMenuOpenState } = args
  const { activeContextWorktrees, repo, worktree, workspaceStatuses } = state
  const updateWorktreeMeta = useAppStore((store) => store.updateWorktreeMeta)
  const setWorktreesPinnedAndReveal = useAppStore((store) => store.setWorktreesPinnedAndReveal)
  const openModal = useAppStore((store) => store.openModal)
  const createProjectGroup = useAppStore((store) => store.createProjectGroup)
  const moveProjectToGroup = useAppStore((store) => store.moveProjectToGroup)
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false)

  const handleCopyPath = () => {
    shellClient.ui.writeClipboardText(worktree.path)
  }

  const handleOpenInNewTab = () => {
    if (!repo) {
      return
    }
    setMenuOpenState(false)
    openSidebarWorkspace({
      openInNewTab: true,
      projectId: repo.id,
      worktreeId: worktree.id
    })
  }

  const handleToggleRead = () => {
    updateWorktreeMeta(worktree.id, { isUnread: !worktree.isUnread })
  }

  const handleTogglePin = () => {
    setWorktreesPinnedAndReveal([worktree.id], !worktree.isPinned)
  }

  const handleCreateGroupFromRepo = () => {
    if (repo) {
      setCreateGroupDialogOpen(true)
    }
  }

  const handleSubmitNewProjectGroup = async (name: string) => {
    if (!repo) {
      return
    }
    const group = await createProjectGroup(name)
    if (group) {
      await moveProjectToGroup(repo.id, group.id)
    }
  }

  const handleMoveProjectToGroup = (groupId: string) => {
    if (repo && repo.projectGroupId !== groupId) {
      void moveProjectToGroup(repo.id, groupId)
    }
  }

  const handleRemoveProjectFromGroup = () => {
    if (repo) {
      void moveProjectToGroup(repo.id, null)
    }
  }

  const handleAssignWorkspaceStatus = (status: string) => {
    setMenuOpenState(false)
    void Promise.all(
      activeContextWorktrees.map((item) =>
        getWorkspaceStatus(item, workspaceStatuses) === status
          ? Promise.resolve()
          : updateWorktreeMeta(item.id, { workspaceStatus: status })
      )
    )
  }

  const handleRename = () => {
    openModal('edit-meta', {
      worktreeId: worktree.id,
      currentDisplayName: worktree.displayName,
      currentPR: worktree.linkedPR,
      currentComment: worktree.comment,
      focus: 'displayName'
    })
  }

  return {
    canOpenInNewTab: repo !== undefined && hasSidebarHostNavigation(),
    createGroupDialogOpen,
    handleAssignWorkspaceStatus,
    handleCopyPath,
    handleCreateGroupFromRepo,
    handleMoveProjectToGroup,
    handleOpenInNewTab,
    handleRemoveProjectFromGroup,
    handleRename,
    handleSubmitNewProjectGroup,
    handleTogglePin,
    handleToggleRead,
    setCreateGroupDialogOpen
  }
}

export type WorkspaceMenuActions = ReturnType<typeof useWorkspaceMenuActions>
