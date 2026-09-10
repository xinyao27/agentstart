import { folderWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { StateCreator } from 'zustand'
import { readProjectCatalogMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import {
  createRuntimeFolderWorkspace,
  deleteRuntimeFolderWorkspace,
  updateRuntimeFolderWorkspace
} from '~renderer/runtime/folder-workspace-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { formatFolderWorkspaceCreateError } from '~renderer/sidebar/folder-workspace-path-status'

import type { AppState } from '../../store/types'
import { getFolderWorkspacePathStatusRouteSettings } from './path-status-model'
import type { RepoSlice } from './slice'

export function createFolderWorkspaceActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'createFolderWorkspace' | 'updateFolderWorkspace' | 'deleteFolderWorkspace'> {
  return {
    createFolderWorkspace: async (args, options) => {
      try {
        const target = getActiveRuntimeTarget(
          getFolderWorkspacePathStatusRouteSettings(options, get().settings)
        )
        const result = await createRuntimeFolderWorkspace(target, {
          ...args,
          expectedRevision: readProjectCatalogMutationRevision(target)
        })
        await refreshAfterProjectCatalogMutation(target, result.revision)
        set({ folderWorkspacePathStatuses: {} })
        return result.folderWorkspace
      } catch (error) {
        console.error('Failed to create folder workspace:', error)
        const { title, description } = formatFolderWorkspaceCreateError(error)
        throw new Error(`${title}. ${description}`)
      }
    },
    updateFolderWorkspace: async (folderWorkspaceId, updates) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const result = await updateRuntimeFolderWorkspace(target, {
          expectedRevision: readProjectCatalogMutationRevision(target),
          folderWorkspaceId,
          updates
        })
        await refreshAfterProjectCatalogMutation(target, result.revision)
        if (!result.folderWorkspace) {
          return false
        }
        set({ folderWorkspacePathStatuses: {} })
        return true
      } catch (error) {
        console.error('Failed to update folder workspace:', error)
        return false
      }
    },
    deleteFolderWorkspace: async (folderWorkspaceId) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const result = await deleteRuntimeFolderWorkspace(target, {
          expectedRevision: readProjectCatalogMutationRevision(target),
          folderWorkspaceId
        })
        await refreshAfterProjectCatalogMutation(target, result.revision)
        if (!result.deleted) {
          return false
        }
        set({ folderWorkspacePathStatuses: {} })
        get().purgeWorktreeTerminalState([folderWorkspaceKey(folderWorkspaceId)])
        return true
      } catch (error) {
        console.error('Failed to delete folder workspace:', error)
        return false
      }
    }
  }
}
