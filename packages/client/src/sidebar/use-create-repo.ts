import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import { useQueryClient } from '@tanstack/react-query'
// Create-project flow hook for AddRepoDialog (agentstart#763), split from
// AddRepoCreateStep so the create-state machine stays scoped and testable.
import { useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { readProjectCatalogMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogTargetForRepo } from '~renderer/project-catalog/query'
import {
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees
} from '~renderer/project-catalog/refresh'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import { requireRepoProtocolClient } from '~renderer/runtime/repo-catalog-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { markOnboardingProjectAdded } from '~renderer/sidebar/onboarding-project-checklist'
import { useAppStore } from '~renderer/store/state'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'
import { refreshWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

export function useCreateRepo(
  closeModal: () => void,
  onGitRepoReady?: (repoId: string) => void | Promise<void>,
  options: {
    hostId?: string | null
    runtimeEnvironmentId?: string | null
  } = {}
) {
  const queryClient = useQueryClient()
  const projectCatalog = useProjectCatalog()
  const { repos } = projectCatalog
  const [createName, setCreateName] = useState('')
  const [createParent, setCreateParent] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const mountedRef = useMountedRef()
  const hostToken = options.hostId ?? ''
  const hostTokenRef = useRef(hostToken)
  useLayoutEffect(() => {
    hostTokenRef.current = hostToken
  }, [hostToken])

  // Why: monotonic ID so stale create callbacks can detect they were superseded
  // when the user clicks Back or closes the dialog mid-create. Mirrors the
  // cloneGenRef pattern in AddRepoDialog.
  const createGenRef = useRef(0)

  const resetCreateState = () => {
    createGenRef.current++
    setCreateName('')
    setCreateParent('')
    setCreateError(null)
    setIsCreating(false)
  }

  const handlePickParent = async (): Promise<string | null> => {
    if (options.runtimeEnvironmentId?.trim()) {
      // Why: the native folder picker returns a client-local path. Runtime
      // project creation needs an explicit host parent path.
      toast.error(
        translate(
          'auto.components.sidebar.AddRepoCreateStep.875dda0995',
          'Enter a host parent path.'
        )
      )
      return null
    }
    const gen = createGenRef.current
    const dir = await workspaceHostClient.repos.pickDirectory()
    if (dir && gen === createGenRef.current && mountedRef.current) {
      setCreateParent(dir)
      setCreateError(null)
      return dir
    }
    return null
  }

  const handleCreate = async () => {
    const name = createName.trim()
    const parentPath = createParent.trim()
    if (!name || !parentPath) {
      return
    }
    const requestHostToken = hostToken
    const gen = ++createGenRef.current
    setIsCreating(true)
    setCreateError(null)
    try {
      const target = options.runtimeEnvironmentId?.trim()
        ? { kind: 'environment' as const, environmentId: options.runtimeEnvironmentId.trim() }
        : getActiveRuntimeTarget({
            ...useAppStore.getState().settings,
            activeRuntimeEnvironmentId: null
          })
      // Why: Create Project is intentionally Git-only; non-Git folders use the
      // existing add-folder flows instead of this path.
      const createKind = 'git' as const
      const expectedRevision = readProjectCatalogMutationRevision(target)
      const result =
        target.kind === 'environment'
          ? await (
              await requireRepoProtocolClient(target)
            ).create(
              {
                expectedRevision,
                parentPath,
                name,
                kind: createKind
              },
              { timeoutMs: 60_000 }
            )
          : await workspaceHostClient.repos.create({
              expectedRevision,
              parentPath,
              name,
              kind: createKind
            })
      // Why: if the user closed the dialog or clicked Back mid-create,
      // createGenRef was bumped by resetCreateState. Ignore stale results.
      if (
        gen !== createGenRef.current ||
        requestHostToken !== hostTokenRef.current ||
        !mountedRef.current
      ) {
        return
      }
      if ('error' in result) {
        setCreateError(result.error)
        return
      }
      await refreshAfterProjectCatalogMutation(target, result.revision)
      const repo = result.repo
      const existingIdx = repos.findIndex((candidate) => candidate.id === repo.id)
      // Why: the IPC handler dedupes by path (see repos:create) and returns
      // the existing repo unchanged. If its ID is already in our store, the
      // handler took the dedup path — no new project was created, so don't
      // claim one was.
      const wasDeduped = existingIdx !== -1
      await refreshProjectCatalogTargetRepos(queryClient, target)
      if (wasDeduped) {
        toast.info(
          translate(
            'auto.components.sidebar.AddRepoCreateStep.2c12db1511',
            'Project already added'
          ),
          {
            description: repo.displayName
          }
        )
      } else {
        toast.success(
          translate('auto.components.sidebar.AddRepoCreateStep.5e97f0c4b9', 'Project created'),
          {
            description: repo.displayName
          }
        )
      }
      if (isGitRepoKind(repo)) {
        // Why: Git repos use the shared default-checkout completion path.
        // Why: if refresh is temporarily non-authoritative, the shared opener
        // still reveals the project so the user is not left in a completed add flow.
        await refreshWorktreeCatalog(projectCatalogTargetForRepo(repo), repo.id)
        if (
          gen !== createGenRef.current ||
          requestHostToken !== hostTokenRef.current ||
          !mountedRef.current
        ) {
          return
        }
        await onGitRepoReady?.(repo.id)
      } else {
        // Why: folder repos skip the Git default-checkout handoff, so activate the synthetic
        // root workspace before closing. Matches the folder-add command's behavior.
        const folderWorktrees = await refreshProjectCatalogWorktrees(queryClient, repo)
        if (
          gen !== createGenRef.current ||
          requestHostToken !== hostTokenRef.current ||
          !mountedRef.current
        ) {
          return
        }
        const folderWorktree = folderWorktrees.worktrees[0]
        if (folderWorktree) {
          activateAndRevealWorktree(folderWorktree.id, { sidebarRevealBehavior: 'auto' })
        }
        await markOnboardingProjectAdded('addedFolder')
        closeModal()
      }
    } catch (err) {
      if (
        gen !== createGenRef.current ||
        requestHostToken !== hostTokenRef.current ||
        !mountedRef.current
      ) {
        return
      }
      setCreateError(extractRuntimeErrorMessage(err, String(err)))
    } finally {
      // Why: only clear the loading state if this invocation is still current;
      // a superseded create must not flip the flag back off for a new flow.
      if (
        gen === createGenRef.current &&
        requestHostToken === hostTokenRef.current &&
        mountedRef.current
      ) {
        setIsCreating(false)
      }
    }
  }

  return {
    createName,
    createParent,
    createError,
    isCreating,
    setCreateName,
    setCreateParent,
    setCreateError,
    resetCreateState,
    handlePickParent,
    handleCreate
  }
}
