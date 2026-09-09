import { getRepoExecutionHostId } from '@yiru/protocol/host/identity'
import { isRuntimePtyId } from '@yiru/protocol/terminal-identity'
import { getRepoIdFromWorktreeId } from '@yiru/protocol/worktree/identity'
import type { StateCreator } from 'zustand'
import { readProjectCatalogMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { requireRepoProtocolClient } from '~renderer/runtime/repo-catalog-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { closeRuntimeTerminal } from '~renderer/runtime/terminal-inspection'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import { omitSparsePresetsForRepos } from '../../sparse/state'
import type { AppState } from '../../store/types'
import { findRepoForHost, repoMatchesHostIdentity } from './host-identity'
import { settingsForRepoOwner } from './path-status-model'
import type { RepoSlice } from './slice'
import { getKnownRepoWorktreeIds } from './update-model'

export function createRepoRemoveProjectActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'removeProject'> {
  return {
    removeProject: async (projectId, options) => {
      try {
        const catalog = readProjectCatalogRuntimeState()
        const ownerRepo = findRepoForHost(catalog.repos, projectId, {
          settings: catalog.settings,
          hostId: options?.hostId
        })
        if (!ownerRepo) {
          return false
        }
        const ownerHostId = getRepoExecutionHostId(ownerRepo)
        const target = getActiveRuntimeTarget(
          settingsForRepoOwner(catalog, projectId, options?.hostId)
        )
        const expectedRevision = readProjectCatalogMutationRevision(target)
        const idExistsOnOtherHost = catalog.repos.some(
          (repo) => repo.id === projectId && getRepoExecutionHostId(repo) !== ownerHostId
        )
        const result = await (target.kind === 'local'
          ? idExistsOnOtherHost
            ? workspaceHostClient.repos.removeForHost({
                expectedRevision,
                repoId: projectId,
                hostId: ownerHostId
              })
            : workspaceHostClient.repos.remove({ expectedRevision, repoId: projectId })
          : await (
              await requireRepoProtocolClient(target)
            ).rm({ expectedRevision, repo: projectId }, { timeoutMs: 15_000 }))
        await refreshAfterProjectCatalogMutation(target, result.revision)

        get().clearYiruHookTrustForRepo(projectId)
        get().evictGitHubRepoCaches(projectId, ownerRepo.path)
        const worktreeIds = getKnownRepoWorktreeIds(catalog, projectId, ownerHostId)
        await stopRemovedRuntimeTerminals(target, worktreeIds)
        closeRemovedLocalTerminals(get(), worktreeIds)
        get().purgeWorktreeTerminalState(worktreeIds)

        const remainingRepos = catalog.repos.filter(
          (repo) => !repoMatchesHostIdentity(repo, projectId, ownerHostId)
        )
        const repoIdFullyRemoved = !remainingRepos.some((repo) => repo.id === projectId)
        set((state) => {
          const nextLastVisitedAtByWorktreeId = { ...state.lastVisitedAtByWorktreeId }
          if (repoIdFullyRemoved) {
            for (const id of Object.keys(nextLastVisitedAtByWorktreeId)) {
              if (getRepoIdFromWorktreeId(id) === projectId) {
                delete nextLastVisitedAtByWorktreeId[id]
              }
            }
          }
          return {
            ...(repoIdFullyRemoved ? omitSparsePresetsForRepos(state, [projectId]) : {}),
            activeRepoId: state.activeRepoId === projectId ? null : state.activeRepoId,
            filterRepoIds: state.filterRepoIds.filter((id) => id !== projectId),
            folderWorkspacePathStatuses: {},
            lastVisitedAtByWorktreeId: nextLastVisitedAtByWorktreeId,
            sortEpoch: state.sortEpoch + 1,
            ...(remainingRepos.length === 0
              ? {
                  activeView: 'terminal' as const,
                  activeWorktreeId: null,
                  activeWorkspaceKey: null,
                  activeRepoId: null
                }
              : {})
          }
        })
        return true
      } catch (error) {
        console.error('Failed to remove repo:', error)
        return false
      }
    }
  }
}

async function stopRemovedRuntimeTerminals(
  target: ReturnType<typeof getActiveRuntimeTarget>,
  worktreeIds: readonly string[]
): Promise<void> {
  if (target.kind !== 'environment') {
    return
  }
  const client = await openRuntimeTerminalClient(target)
  await Promise.allSettled(
    worktreeIds.map((worktreeId) =>
      client.stop(toRuntimeWorktreeSelector(worktreeId), { timeoutMs: 15_000 })
    )
  )
}

function closeRemovedLocalTerminals(state: AppState, worktreeIds: readonly string[]): void {
  for (const worktreeId of worktreeIds) {
    for (const tab of state.tabsByWorktree[worktreeId] ?? []) {
      for (const ptyId of state.ptyIdsByTabId[tab.id] ?? []) {
        if (!isRuntimePtyId(ptyId)) {
          void closeRuntimeTerminal(ptyId)
        }
      }
    }
  }
}
