import type { StateCreator } from 'zustand'
import {
  readProjectCatalogMutationRevision,
  readProjectCatalogSnapshot
} from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import {
  createRuntimeProjectHostSetup,
  deleteRuntimeProjectHostSetup,
  updateRuntimeProjectHostSetup
} from '~renderer/runtime/project-host-setup-target'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { requireRepoProtocolClient } from '~renderer/runtime/repo-catalog-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'

import { omitSparsePresetsForRepos } from '../../sparse/state'
import type { AppState } from '../../store/types'
import type { RepoSlice } from './slice'
import {
  getProjectSetupRuntimeTarget,
  repoWithFetchedOwner,
  setupWithFetchedOwner,
  assertProjectHostSetupMutationRuntimeCapabilities
} from './target-model'

export function createRepoHostSetupActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<
  RepoSlice,
  | 'createProjectHostSetup'
  | 'updateProjectHostSetup'
  | 'deleteProjectHostSetup'
  | 'setupProjectClone'
  | 'addRepo'
  | 'registerNonGitFolder'
> {
  return {
    createProjectHostSetup: async (args) => {
      try {
        const target = getProjectSetupRuntimeTarget(args.hostId)
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const response = await createRuntimeProjectHostSetup(target, {
          ...args,
          expectedRevision: readProjectCatalogMutationRevision(target)
        })
        await refreshAfterProjectCatalogMutation(target, response.revision)
        const result = response.result
        const setup = setupWithFetchedOwner(result.setup, target)
        return { project: result.project, setup }
      } catch (err) {
        console.error('Failed to create project host setup:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    updateProjectHostSetup: async (args) => {
      try {
        const currentSetup = readProjectCatalogSnapshot().projectHostSetups.find(
          (setup) => setup.id === args.setupId
        )
        const target = currentSetup
          ? getProjectSetupRuntimeTarget(currentSetup.hostId)
          : { kind: 'local' as const }
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const response = await updateRuntimeProjectHostSetup(target, {
          ...args,
          expectedRevision: readProjectCatalogMutationRevision(target)
        })
        await refreshAfterProjectCatalogMutation(target, response.revision)
        const result = response.result
        const setup = setupWithFetchedOwner(result.setup, target)
        const repo = result.repo ? repoWithFetchedOwner(result.repo, target) : undefined
        return { ...result, repo, setup }
      } catch (err) {
        console.error('Failed to update project host setup:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    deleteProjectHostSetup: async (args) => {
      try {
        const currentSetup = readProjectCatalogSnapshot().projectHostSetups.find(
          (setup) => setup.id === args.setupId
        )
        const target = currentSetup
          ? getProjectSetupRuntimeTarget(currentSetup.hostId)
          : { kind: 'local' as const }
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const response = await deleteRuntimeProjectHostSetup(target, {
          ...args,
          expectedRevision: readProjectCatalogMutationRevision(target)
        })
        await refreshAfterProjectCatalogMutation(target, response.revision)
        const result = response.result
        const repo = result.repo ? repoWithFetchedOwner(result.repo, target) : undefined
        if (
          repo &&
          readProjectCatalogSnapshot().repos.filter((candidate) => candidate.id === repo.id)
            .length <= 1
        ) {
          set((state) => omitSparsePresetsForRepos(state, [repo.id]))
        }
        return { ...result, repo }
      } catch (err) {
        console.error('Failed to delete project host setup:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    setupProjectClone: async (args) => {
      try {
        const target = getProjectSetupRuntimeTarget(args.hostId)
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        const expectedRevision = readProjectCatalogMutationRevision(target)
        const cloneResult =
          target.kind === 'local'
            ? await workspaceHostClient.repos.clone({
                expectedRevision,
                url: args.url,
                destination: args.destination
              })
            : await (
                await requireRepoProtocolClient(target)
              ).clone(
                {
                  expectedRevision,
                  url: args.url,
                  destination: args.destination
                },
                { timeoutMs: 10 * 60_000 }
              )
        await refreshAfterProjectCatalogMutation(target, cloneResult.revision)
        const repo = cloneResult.repo
        return await get().setupProjectExistingFolder({
          projectId: args.projectId,
          hostId: args.hostId,
          path: repo.path,
          kind: 'git',
          displayName: args.displayName,
          setupMethod: 'cloned'
        })
      } catch (err) {
        console.error('Failed to clone project on host:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    addRepo: async () => {
      const target = getActiveRuntimeTarget(get().settings)
      if (target.kind !== 'local') {
        // Why: OS folder pickers return client-local paths. Remote environments
        // need an explicit host path, which the Add Project dialog handles.
        publishRendererCommandResult({ type: 'repository-add-route-required' })
        return null
      }
      const path = await workspaceHostClient.repos.pickFolder()
      if (!path) {
        return null
      }
      return get().addRepoPath(path)
    },
    registerNonGitFolder: async (path, options) => {
      try {
        return await get().addRepoPath(path, 'folder', options)
      } catch (err) {
        console.error('Failed to add folder:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-folder-add-failed', error: message })
        return null
      }
    }
  }
}
