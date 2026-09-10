import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { Repo } from '@agentstart/protocol/project/repository'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { selectProjectGroupRemovalTargets } from '~renderer/repo/state/group-removal-targets'
import { useAppStore } from '~renderer/store/state'

type NameDialogState =
  | { type: 'create-from-repo'; repo: Repo }
  | { type: 'rename'; groupId: string; currentName: string }

type DeleteDialogState = {
  groupId: string
  groupName: string
  removeContainedProjects: boolean
}

export function useProjectGroupActions(args: {
  projectGroups: readonly ProjectGroup[]
  repos: readonly Repo[]
  repoMap: Map<string, Repo>
}) {
  const moveProjectToGroup = useAppStore((state) => state.moveProjectToGroup)
  const createProjectGroup = useAppStore((state) => state.createProjectGroup)
  const updateProjectGroup = useAppStore((state) => state.updateProjectGroup)
  const deleteGroup = useAppStore((state) => state.deleteProjectGroupWithContainedProjects)
  const openModal = useAppStore((state) => state.openModal)
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null)
  const deleteTargets = deleteDialog
    ? selectProjectGroupRemovalTargets(args.projectGroups, args.repos, deleteDialog.groupId)
    : null
  const deleteProjectNames = (deleteTargets?.projectIds ?? []).map(
    (projectId) => args.repoMap.get(projectId)?.displayName ?? projectId
  )
  const deleteProjectCount = deleteTargets?.projectIds.length ?? 0
  const removesContainedProjects =
    deleteProjectCount > 0 && deleteDialog?.removeContainedProjects === true

  const submitName = async (name: string): Promise<void> => {
    if (!nameDialog) {
      return
    }
    if (nameDialog.type === 'create-from-repo') {
      const group = await createProjectGroup(name)
      if (group) {
        await moveProjectToGroup(nameDialog.repo.id, group.id)
      }
      return
    }
    await updateProjectGroup(nameDialog.groupId, { name })
  }
  const confirmDelete = async (): Promise<void> => {
    if (!deleteDialog) {
      return
    }
    try {
      const result = await deleteGroup(deleteDialog.groupId, {
        removeContainedProjects: removesContainedProjects
      })
      if (result.status === 'group-delete-failed') {
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeList.groupDeleteFailed',
            'Failed to delete group'
          ),
          {
            description: translate(
              'auto.components.sidebar.WorktreeList.groupDeleteFailedDesc',
              'Something went wrong while deleting the group. No projects were removed.'
            )
          }
        )
        return
      }
      if (result.status === 'deleted-group' && result.failedProjectRemovals.length > 0) {
        const failedCount = result.failedProjectRemovals.length
        const requestedCount = result.requestedProjectIds.length
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeList.b667b59632',
            'Some projects could not be removed from AgentStart'
          ),
          {
            description: translate(
              'auto.components.sidebar.WorktreeList.f94466bc39',
              '{{value0}} of {{value1}} contained project{{value2}} remained after deleting the group.',
              {
                value0: failedCount,
                value1: requestedCount,
                value2: requestedCount === 1 ? '' : 's'
              }
            )
          }
        )
      }
    } finally {
      // Why: removing contained projects can unmount the dialog before its close handler runs.
      setDeleteDialog(null)
    }
  }
  return {
    nameDialog,
    deleteDialog,
    deleteProjectCount,
    deleteProjectNames,
    removesContainedProjects,
    closeNameDialog: () => setNameDialog(null),
    closeDeleteDialog: () => setDeleteDialog(null),
    setRemovesContainedProjects: (removeContainedProjects: boolean) =>
      setDeleteDialog((current) => (current ? { ...current, removeContainedProjects } : current)),
    createFromRepo: (repo: Repo) => setNameDialog({ type: 'create-from-repo', repo }),
    moveToGroup: (repo: Repo, groupId: string) => {
      if (repo.projectGroupId !== groupId) {
        void moveProjectToGroup(repo.id, groupId)
      }
    },
    removeFromGroup: (repo: Repo) => void moveProjectToGroup(repo.id, null),
    rename: (groupId: string, currentName: string) =>
      setNameDialog({ type: 'rename', groupId, currentName }),
    requestDelete: (groupId: string, groupName: string) =>
      setDeleteDialog({ groupId, groupName, removeContainedProjects: false }),
    createFolderWorkspace: (projectGroup: ProjectGroup) => {
      if (projectGroup.parentPath) {
        openModal('new-workspace-composer', {
          initialProjectGroupId: projectGroup.id,
          telemetrySource: 'sidebar'
        })
      }
    },
    submitName,
    confirmDelete
  }
}
