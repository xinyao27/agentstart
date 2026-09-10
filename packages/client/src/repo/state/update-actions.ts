import { getRepoExecutionHostId, parseExecutionHostId } from '@agentstart/protocol/host/identity'
import type { StateCreator } from 'zustand'
import {
  readProjectCatalogMutationRevision,
  readProjectCatalogQueryClient
} from '~renderer/project-catalog/catalog-snapshot'
import { getManualRepoOrder } from '~renderer/project-catalog/group-order'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import { invalidateAllProjectCatalogTargets } from '~renderer/project-catalog/refresh'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { notifyInstalledAgentSkillsChanged } from '~renderer/runtime/installed-agent-skill-discovery-state'
import { updateRuntimeProject } from '~renderer/runtime/project-target'
import { requireRepoProtocolClient } from '~renderer/runtime/repo-catalog-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'

import type { AppState } from '../../store/types'
import { findRepoForHost, getRepoHostIdentityForParts } from './host-identity'
import { settingsForRepoOwner } from './path-status-model'
import { splitRepoReorderByHost } from './reorder-host-split'
import type { RepoSlice } from './slice'
import { getProjectSetupRuntimeTarget, getProjectUpdateRuntimeTarget } from './target-model'
import { sanitizeRepoUpdate, getRepoUpdateChains, getRuntimeTargetHostId } from './update-model'

export function createRepoUpdateActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'updateProject' | 'updateRepo' | 'setActiveRepo' | 'reorderRepos'> {
  return {
    updateProject: async (projectId, updates) => {
      try {
        const catalog = readProjectCatalogRuntimeState()
        const target = getProjectUpdateRuntimeTarget(catalog, projectId)
        const response = await updateRuntimeProject(target, {
          expectedRevision: readProjectCatalogMutationRevision(target),
          projectId,
          updates
        })
        await refreshAfterProjectCatalogMutation(target, response.revision)
        set({ folderWorkspacePathStatuses: {} })
        if ('localWindowsRuntimePreference' in updates) {
          get().clearLocalDetectedAgents()
          notifyInstalledAgentSkillsChanged()
        }
        return true
      } catch (error) {
        console.error('Failed to update project:', error)
        return false
      }
    },
    updateRepo: async (projectId, updates, options) => {
      const catalog = readProjectCatalogRuntimeState()
      const ownerRepo = findRepoForHost(catalog.repos, projectId, {
        settings: catalog.settings,
        hostId: options?.hostId
      })
      if (!ownerRepo) {
        return false
      }
      const ownerHasExplicitHost = Boolean(options?.hostId || ownerRepo.executionHostId?.trim())
      const explicitOwnerHostId = getRepoExecutionHostId(ownerRepo)
      const target = ownerHasExplicitHost
        ? getProjectSetupRuntimeTarget(explicitOwnerHostId)
        : getActiveRuntimeTarget(settingsForRepoOwner(catalog, projectId))
      const ownerHostId = ownerHasExplicitHost
        ? explicitOwnerHostId
        : getRuntimeTargetHostId(target)
      const chainKey = getRepoHostIdentityForParts(projectId, ownerHostId)
      const chains = getRepoUpdateChains(get)
      const applyUpdate = async (): Promise<boolean> => {
        try {
          const sanitizedUpdates = sanitizeRepoUpdate(updates)
          const expectedRevision = readProjectCatalogMutationRevision(target)
          const response =
            target.kind === 'local'
              ? await workspaceHostClient.repos.update({
                  expectedRevision,
                  repoId: projectId,
                  updates: sanitizedUpdates
                })
              : await (
                  await requireRepoProtocolClient(target)
                ).update(
                  { expectedRevision, repo: projectId, updates: sanitizedUpdates },
                  { timeoutMs: 15_000 }
                )
          await refreshAfterProjectCatalogMutation(target, response.revision)
          set({ folderWorkspacePathStatuses: {} })
          return true
        } catch (error) {
          console.error('Failed to update repo:', error)
          return false
        }
      }
      const previous = chains.get(chainKey)
      const next = previous ? previous.catch(() => undefined).then(applyUpdate) : applyUpdate()
      chains.set(chainKey, next)
      const cleanup = () => {
        if (chains.get(chainKey) === next) {
          chains.delete(chainKey)
        }
      }
      void next.then(cleanup, cleanup)
      return next
    },
    setActiveRepo: (projectId) => set({ activeRepoId: projectId }),
    reorderRepos: async (orderedIds) => {
      const catalog = readProjectCatalogRuntimeState()
      if (
        !isRepoPermutation(
          catalog.repos.map((repo) => repo.id),
          orderedIds
        )
      ) {
        return
      }
      const manualRepoOrder = getManualRepoOrder(
        orderedIds.flatMap((id) => catalog.repos.filter((repo) => repo.id === id))
      )
      set({ folderWorkspacePathStatuses: {}, manualRepoOrder })
      try {
        const groups = splitRepoReorderByHost(orderedIds, catalog.repos, catalog.settings)
        for (const group of groups) {
          const parsed = parseExecutionHostId(group.hostId)
          const target =
            parsed?.kind === 'runtime'
              ? ({ kind: 'environment', environmentId: parsed.environmentId } as const)
              : ({ kind: 'local' } as const)
          const expectedRevision = readProjectCatalogMutationRevision(target)
          const result =
            target.kind === 'local'
              ? await workspaceHostClient.repos.reorderForHost({
                  expectedRevision,
                  hostId: group.hostId,
                  orderedIds: group.orderedIds
                })
              : await (
                  await requireRepoProtocolClient(target)
                ).reorder({ expectedRevision, orderedIds: group.orderedIds }, { timeoutMs: 15_000 })
          await refreshAfterProjectCatalogMutation(target, result.revision)
        }
        await setRuntimeUIState(catalog.settings, { manualRepoOrder })
      } catch (error) {
        console.error('Failed to reorder repos:', error)
        await invalidateAllProjectCatalogTargets(readProjectCatalogQueryClient())
      }
    }
  }
}

function isRepoPermutation(current: readonly string[], requested: readonly string[]): boolean {
  if (current.length !== requested.length) {
    return false
  }
  const remaining = new Map<string, number>()
  for (const id of current) {
    remaining.set(id, (remaining.get(id) ?? 0) + 1)
  }
  for (const id of requested) {
    const count = remaining.get(id) ?? 0
    if (count === 0) {
      return false
    }
    remaining.set(id, count - 1)
  }
  return true
}
