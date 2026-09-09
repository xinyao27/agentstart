import type { StateCreator } from 'zustand'
import { readProjectCatalogMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { requireProjectGroupProtocolClient } from '~renderer/runtime/project-group-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../../store/types'
import { selectProjectGroupRemovalTargets } from './group-removal-targets'
import { findRepoForHost } from './host-identity'
import { settingsForRepoOwner } from './path-status-model'
import type { RepoSlice } from './slice'
import { projectGroupWithFetchedOwner } from './target-model'
import type { ProjectRemovalFailure } from './update-model'

export function createRepoProjectGroupActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<
  RepoSlice,
  | 'createProjectGroup'
  | 'updateProjectGroup'
  | 'deleteProjectGroup'
  | 'deleteProjectGroupWithContainedProjects'
  | 'moveProjectToGroup'
> {
  return {
    createProjectGroup: async (name) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const result = await (
          await requireProjectGroupProtocolClient(target)
        ).create(
          {
            expectedRevision: readProjectCatalogMutationRevision(target),
            name,
            createdFrom: 'manual'
          },
          { timeoutMs: 15_000 }
        )
        await refreshAfterProjectCatalogMutation(target, result.revision)
        const group = result.group
        const ownedGroup = projectGroupWithFetchedOwner(group, target)
        set({ folderWorkspacePathStatuses: {} })
        return ownedGroup
      } catch (err) {
        console.error('Failed to create project group:', err)
        return null
      }
    },
    updateProjectGroup: async (groupId, updates) => {
      try {
        // Why: project groups are focused-host-scoped by design — fetch/create/update/
        // delete all route by the focused host, and the list is replaced (not merged).
        const target = getActiveRuntimeTarget(get().settings)
        const result = await (
          await requireProjectGroupProtocolClient(target)
        ).update(
          {
            expectedRevision: readProjectCatalogMutationRevision(target),
            groupId,
            updates
          },
          { timeoutMs: 15_000 }
        )
        await refreshAfterProjectCatalogMutation(target, result.revision)
        const updated = result.group
        if (!updated) {
          return false
        }
        set({ folderWorkspacePathStatuses: {} })
        return true
      } catch (err) {
        console.error('Failed to update project group:', err)
        return false
      }
    },
    deleteProjectGroup: async (groupId) => {
      try {
        // Why: project groups are focused-host-scoped by design (see updateProjectGroup).
        const target = getActiveRuntimeTarget(get().settings)
        const result = await (
          await requireProjectGroupProtocolClient(target)
        ).delete(
          { expectedRevision: readProjectCatalogMutationRevision(target), groupId },
          { timeoutMs: 15_000 }
        )
        await refreshAfterProjectCatalogMutation(target, result.revision)
        const deleted = result.deleted
        if (!deleted) {
          return false
        }
        set({ folderWorkspacePathStatuses: {} })
        return true
      } catch (err) {
        console.error('Failed to delete project group:', err)
        return false
      }
    },
    deleteProjectGroupWithContainedProjects: async (groupId, options) => {
      const catalog = readProjectCatalogRuntimeState()
      const targets = selectProjectGroupRemovalTargets(
        catalog.projectGroups,
        catalog.repos,
        groupId
      )
      const requestedProjectIds = options.removeContainedProjects ? targets.projectIds : []
      if (!targets.groupExists) {
        return {
          status: 'missing-group',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      const deleted = await get().deleteProjectGroup(groupId)
      if (!deleted) {
        return {
          status: 'group-delete-failed',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      if (!options.removeContainedProjects) {
        return {
          status: 'deleted-group',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      const removedProjectIds: string[] = []
      const failedProjectRemovals: ProjectRemovalFailure[] = []
      for (const projectId of targets.projectIds) {
        const removed = await get().removeProject(projectId)
        if (!removed) {
          failedProjectRemovals.push({
            projectId,
            reason: 'Project removal was rejected by the runtime.'
          })
        } else {
          removedProjectIds.push(projectId)
        }
      }

      return {
        status: 'deleted-group',
        groupId,
        requestedProjectIds,
        removedProjectIds,
        failedProjectRemovals
      }
    },
    moveProjectToGroup: async (projectId, groupId, order) => {
      try {
        const catalog = readProjectCatalogRuntimeState()
        if (!findRepoForHost(catalog.repos, projectId, { settings: catalog.settings })) {
          return false
        }
        const target = getActiveRuntimeTarget(settingsForRepoOwner(catalog, projectId))
        const result = await (
          await requireProjectGroupProtocolClient(target)
        ).moveProject(
          {
            expectedRevision: readProjectCatalogMutationRevision(target),
            repo: projectId,
            // Why: the wire treats a null groupId and an absent one the same as
            // the legacy surface did — both clear the group assignment.
            ...(groupId === null ? {} : { groupId }),
            order
          },
          { timeoutMs: 15_000 }
        )
        await refreshAfterProjectCatalogMutation(target, result.revision)
        const moved = result.repo
        if (!moved) {
          return false
        }
        set({ folderWorkspacePathStatuses: {} })
        return true
      } catch (err) {
        console.error('Failed to move repo to group:', err)
        return false
      }
    }
  }
}
