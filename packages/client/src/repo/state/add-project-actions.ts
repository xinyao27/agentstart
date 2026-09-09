import type { Repo } from '@yiru/protocol/project/repository'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import type { StateCreator } from 'zustand'
import {
  readProjectCatalogMutationRevision,
  readProjectCatalogSnapshot
} from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { setupExistingRuntimeProjectFolder } from '~renderer/runtime/project-host-setup-target'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { addRuntimeRepo } from '~renderer/runtime/repo-catalog-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../../store/types'
import { getRepoHostIdentity } from './host-identity'
import {
  getAddRepoPathRouteSettings,
  getRuntimeEnvironmentDisplayName,
  fetchRuntimeAddProjectPathStatus
} from './path-status-model'
import type { RepoSlice } from './slice'
import {
  getProjectSetupRuntimeTarget,
  warnIfProjectKnownInAnotherProfile,
  repoWithFetchedOwner,
  setupWithFetchedOwner,
  assertProjectHostSetupMutationRuntimeCapabilities
} from './target-model'

export function createRepoAddProjectActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'addRepoPath' | 'setupProjectExistingFolder'> {
  return {
    addRepoPath: async (path, kind = 'git', options) => {
      try {
        const target = getActiveRuntimeTarget(getAddRepoPathRouteSettings(options, get().settings))
        const knownRepoIdentities = new Set(
          readProjectCatalogSnapshot().repos.map(getRepoHostIdentity)
        )
        const expectedRevision = readProjectCatalogMutationRevision(target)
        let repo: Repo
        try {
          const result = await addRuntimeRepo(target, { expectedRevision, path, kind })
          await refreshAfterProjectCatalogMutation(target, result.revision)
          repo = result.repo
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (kind !== 'git' || !message.includes('Not a valid git repository')) {
            throw err
          }
          if (target.kind !== 'local') {
            const status = await fetchRuntimeAddProjectPathStatus({ target, path })
            if (status?.exists !== true) {
              const hostName = getRuntimeEnvironmentDisplayName(
                readProjectCatalogRuntimeState(),
                target.environmentId
              )
              publishRendererCommandResult({
                type: 'repository-runtime-folder-unavailable',
                path,
                hostName
              })
              return null
            }
          }
          // Why: folder mode is a capability downgrade, not a silent fallback.
          // Show an in-app confirmation dialog so users understand that worktrees,
          // SCM, PRs, and checks will be unavailable for this root. The accepted
          // path is then routed through the explicit folder-add command.
          const { openModal } = get()
          openModal('confirm-non-git-folder', {
            folderPath: path,
            ...(target.kind === 'environment' ? { runtimeEnvironmentId: target.environmentId } : {})
          })
          return null
        }
        repo = repoWithFetchedOwner(repo, target)
        const repoIdentity = getRepoHostIdentity(repo)
        const alreadyAdded = knownRepoIdentities.has(repoIdentity)
        if (alreadyAdded) {
          get().clearYiruHookTrustForRepo(repo.id)
        }
        set({ folderWorkspacePathStatuses: {} })
        if (alreadyAdded) {
          publishRendererCommandResult({
            type: 'repository-add',
            outcome: 'already-added',
            displayName: repo.displayName
          })
        } else {
          publishRendererCommandResult({
            type: 'repository-add',
            outcome: 'added',
            projectKind: isGitRepoKind(repo) ? 'git' : 'folder',
            displayName: repo.displayName
          })
          // Why: the design requires the cross-profile advisory for paired-runtime
          // projects too because the presence lookup is already host-scoped.
          await warnIfProjectKnownInAnotherProfile(repo, get().activeYiruProfileId)
        }
        return repo
      } catch (err) {
        console.error('Failed to add project:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    },
    setupProjectExistingFolder: async (args) => {
      try {
        const target = getProjectSetupRuntimeTarget(args.hostId)
        await assertProjectHostSetupMutationRuntimeCapabilities(target)
        // Why: the setup verb carries no display name — the daemon derives the
        // setup's name from the imported folder, exactly as the legacy contract did.
        const response = await setupExistingRuntimeProjectFolder(target, {
          expectedRevision: readProjectCatalogMutationRevision(target),
          hostId: args.hostId,
          kind: args.kind,
          path: args.path,
          projectId: args.projectId,
          setupMethod: args.setupMethod
        })
        await refreshAfterProjectCatalogMutation(target, response.revision)
        const result = response.result
        // Why: the import verb always attaches the created repo row; anything
        // else is a daemon contract violation worth failing loudly.
        if (!result.repo) {
          throw new Error('project_host_setup_import_missing_repo')
        }
        const repo = repoWithFetchedOwner(result.repo, target)
        const setup = setupWithFetchedOwner(result.setup, target)
        publishRendererCommandResult({
          type: 'repository-add',
          outcome: 'added',
          projectKind: 'git',
          displayName: repo.displayName
        })
        return { ...result, repo, setup }
      } catch (err) {
        console.error('Failed to set up project on host:', err)
        const message = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({ type: 'repository-add', outcome: 'failed', error: message })
        return null
      }
    }
  }
}
