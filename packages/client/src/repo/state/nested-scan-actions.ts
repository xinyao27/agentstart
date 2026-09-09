import type { StateCreator } from 'zustand'
import { readProjectCatalogMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import { requireProjectGroupProtocolClient } from '~renderer/runtime/project-group-target'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../../store/types'
import { subscribeToNestedRepoScanProgress } from './nested-scan-events'
import type { RepoSlice } from './slice'
import { normalizeNestedRepoScanResult } from './update-model'

export function createRepoNestedScanActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'scanNestedRepos' | 'cancelNestedRepoScan' | 'importNestedRepos'> {
  return {
    scanNestedRepos: async (path, controls) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const unsubscribe =
          controls?.scanId && controls.onProgress
            ? await subscribeToNestedRepoScanProgress(target, controls.scanId, controls.onProgress)
            : undefined
        try {
          return normalizeNestedRepoScanResult(
            await (
              await requireProjectGroupProtocolClient(target)
            ).scanNested({ path, scanId: controls?.scanId }, { timeoutMs: 20_000 })
          )
        } finally {
          unsubscribe?.()
        }
      } catch (err) {
        console.error('Failed to scan nested repos:', err)
        return null
      }
    },
    cancelNestedRepoScan: async (scanId) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        return (
          await (
            await requireProjectGroupProtocolClient(target)
          ).cancelNestedScan(scanId, { timeoutMs: 15_000 })
        ).cancelled
      } catch (err) {
        console.error('Failed to cancel nested repo scan:', err)
        return false
      }
    },
    importNestedRepos: async (args) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const result = await (
          await requireProjectGroupProtocolClient(target)
        ).importNested(
          {
            expectedRevision: readProjectCatalogMutationRevision(target),
            parentPath: args.parentPath,
            groupName: args.groupName,
            projectPaths: args.projectPaths,
            scanId: args.scanId,
            mode: args.mode
          },
          { timeoutMs: 60_000 }
        )
        await refreshAfterProjectCatalogMutation(target, result.revision)
        set({ folderWorkspacePathStatuses: {} })
        return result
      } catch (err) {
        console.error('Failed to import nested repos:', err)
        publishRendererCommandResult({
          type: 'repository-import-failed',
          error: err instanceof Error ? err.message : String(err)
        })
        return null
      }
    }
  }
}
