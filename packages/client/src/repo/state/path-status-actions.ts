import type { StateCreator } from 'zustand'
import { getRuntimeFolderPathStatus } from '~renderer/runtime/folder-workspace-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../../store/types'
import {
  getFolderWorkspacePathStatusScopeKey,
  getRuntimeTargetCachePrefix,
  getFolderWorkspacePathStatusRouteSettings,
  getFolderWorkspaceStatusRequestSnapshot,
  getFreshFolderWorkspacePathStatusFromCache,
  getFolderWorkspacePathStatusRequestSnapshotForRead
} from './path-status-model'
import type { RepoSlice } from './slice'

export function createRepoPathStatusActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<
  RepoSlice,
  | 'getFolderWorkspacePathStatusCacheKey'
  | 'getFreshFolderWorkspacePathStatus'
  | 'fetchFolderWorkspacePathStatus'
> {
  return {
    getFolderWorkspacePathStatusCacheKey: (request, options) =>
      `${getRuntimeTargetCachePrefix(
        getFolderWorkspacePathStatusRouteSettings(options, get().settings)
      )}:${getFolderWorkspacePathStatusScopeKey(request)}`,
    getFreshFolderWorkspacePathStatus: (request, options) => {
      const state = get()
      const cacheKey = get().getFolderWorkspacePathStatusCacheKey(request, options)
      const cached = state.folderWorkspacePathStatuses[cacheKey]
      const requestSnapshot = getFolderWorkspacePathStatusRequestSnapshotForRead(state, request)
      return getFreshFolderWorkspacePathStatusFromCache({ entry: cached, requestSnapshot })
    },
    fetchFolderWorkspacePathStatus: async (request, options) => {
      const cacheKey = get().getFolderWorkspacePathStatusCacheKey(request, options)
      const requestSnapshot = getFolderWorkspaceStatusRequestSnapshot(get(), request)
      const cached = get().folderWorkspacePathStatuses[cacheKey]
      const freshCachedStatus = getFreshFolderWorkspacePathStatusFromCache({
        entry: cached,
        requestSnapshot
      })
      if (!options?.force && freshCachedStatus) {
        return freshCachedStatus
      }
      try {
        const target = getActiveRuntimeTarget(
          getFolderWorkspacePathStatusRouteSettings(options, get().settings)
        )
        const status = (await getRuntimeFolderPathStatus(target, request)).status
        set((state) => ({
          folderWorkspacePathStatuses:
            requestSnapshot !== null &&
            getFolderWorkspaceStatusRequestSnapshot(state, request) === requestSnapshot
              ? {
                  ...state.folderWorkspacePathStatuses,
                  [cacheKey]: { status, checkedAt: Date.now(), requestSnapshot }
                }
              : state.folderWorkspacePathStatuses
        }))
        return status
      } catch (err) {
        console.error('Failed to fetch folder workspace path status:', err)
        return null
      }
    }
  }
}
