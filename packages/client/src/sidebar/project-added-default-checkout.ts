import { useQueryClient } from '@tanstack/react-query'
import { getRepoExecutionHostId } from '@yiru/protocol/host/identity'
import { relativePathInsideRoot } from '@yiru/protocol/host/path'
import type { Repo } from '@yiru/protocol/project/repository'
import type { EventProps } from '@yiru/protocol/telemetry/events/catalog'
import type { AddRepoDefaultCheckoutHandoffSource } from '@yiru/protocol/telemetry/events/foundations'
import type { DetectedWorktreeListResult, Worktree } from '@yiru/protocol/worktree/model'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import {
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees,
  type ProjectWorktreeCatalog
} from '~renderer/project-catalog/refresh'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { finalizeImportedRepoAfterSkip } from './add-repo/skip-finalization'
import { markOnboardingProjectAdded } from './onboarding-project-checklist'

type DefaultCheckoutHandoffReason = EventProps<'add_repo_default_checkout_handoff'>['reason']

export type OpenProjectDefaultCheckout = (options: {
  project: Repo | string
  selectedPath?: string
  setHideDefaultBranchWorkspace: (value: boolean) => void
  source: AddRepoDefaultCheckoutHandoffSource
}) => Promise<void>

export type FinishProjectAddWithDefaultCheckout = (options: {
  closeModal: () => void
  project: Repo | string
  selectedPath?: string
  setHideDefaultBranchWorkspace: (value: boolean) => void
  source: AddRepoDefaultCheckoutHandoffSource
}) => Promise<void>

export function getProjectDefaultCheckout(worktrees: readonly Worktree[]): Worktree | null {
  return worktrees.find((worktree) => worktree.isMainWorktree) ?? null
}

function getDetectedProjectDefaultCheckout(
  detected: DetectedWorktreeListResult | undefined
): DetectedWorktreeListResult['worktrees'][number] | null {
  if (detected?.authoritative !== true) {
    return null
  }
  return detected.worktrees.find((worktree) => worktree.isMainWorktree) ?? null
}

function hasDetectedHiddenLinkedExternalWorktrees(
  detected: DetectedWorktreeListResult | undefined
): boolean {
  if (detected?.authoritative !== true) {
    return false
  }
  return detected.worktrees.some(
    (worktree) =>
      !worktree.isMainWorktree &&
      !worktree.selectedCheckout &&
      !worktree.visible &&
      worktree.ownership !== 'yiru-managed'
  )
}

function resolveInitialCwdForDefaultCheckout(
  defaultCheckout: Worktree,
  selectedPath: string | undefined
): string | undefined {
  if (!selectedPath) {
    return undefined
  }
  const relativePath = relativePathInsideRoot(defaultCheckout.path, selectedPath)
  return relativePath && relativePath.length > 0 ? selectedPath : undefined
}

export function useProjectDefaultCheckoutHandoff(): {
  finishProjectAddWithDefaultCheckout: FinishProjectAddWithDefaultCheckout
  openProjectDefaultCheckout: OpenProjectDefaultCheckout
} {
  const queryClient = useQueryClient()
  const { repos } = useProjectCatalog()
  const updateRepo = useAppStore((state) => state.updateRepo)

  const resolveProject = useEventCallback(async (project: Repo | string): Promise<Repo | null> => {
    if (typeof project !== 'string') {
      return project
    }
    const loaded = repos.find((repo) => repo.id === project)
    if (loaded) {
      return loaded
    }
    const target = getActiveRuntimeTarget(useAppStore.getState().settings)
    const refreshed = await refreshProjectCatalogTargetRepos(queryClient, target)
    return refreshed.find((repo) => repo.id === project) ?? null
  })

  const setExternalWorktreeVisibility = useEventCallback(async (repo: Repo): Promise<boolean> =>
    updateRepo(
      repo.id,
      { externalWorktreeVisibility: 'show' },
      { hostId: getRepoExecutionHostId(repo) }
    )
  )

  const refreshWorktrees = useEventCallback((repo: Repo): Promise<ProjectWorktreeCatalog> =>
    refreshProjectCatalogWorktrees(queryClient, repo)
  )

  const openProjectDefaultCheckout = useEventCallback<OpenProjectDefaultCheckout>(
    async ({ project, source, selectedPath, setHideDefaultBranchWorkspace }) => {
      const repo = await resolveProject(project)
      if (!repo) {
        const repoId = typeof project === 'string' ? project : project.id
        trackHandoffFallback(repoId, source, 'no_default_checkout')
        return
      }
      let worktreeCatalog = await refreshWorktrees(repo)
      let defaultCheckout = getProjectDefaultCheckout(worktreeCatalog.worktrees)
      let reason: DefaultCheckoutHandoffReason = 'loaded_default_checkout'
      if (!defaultCheckout) {
        const detected = await findDetectedDefaultCheckout(
          repo,
          worktreeCatalog,
          setExternalWorktreeVisibility,
          refreshWorktrees
        )
        defaultCheckout = detected.worktree
        reason = detected.reason
        worktreeCatalog = detected.catalog
      }

      if (!defaultCheckout) {
        trackHandoffFallback(repo.id, source, reason)
        return
      }
      const linkedFailureReason = await revealDetectedHiddenLinkedExternalWorktrees(
        repo,
        worktreeCatalog,
        setExternalWorktreeVisibility,
        refreshWorktrees
      )
      if (linkedFailureReason) {
        trackHandoffFallback(repo.id, source, linkedFailureReason)
        return
      }
      if (useAppStore.getState().hideDefaultBranchWorkspace) {
        setHideDefaultBranchWorkspace(false)
      }
      track('add_repo_default_checkout_handoff', {
        source,
        result: 'opened_default_checkout',
        reason
      })
      const initialCwd = resolveInitialCwdForDefaultCheckout(defaultCheckout, selectedPath)
      activateAndRevealWorktree(defaultCheckout.id, initialCwd ? { initialCwd } : undefined)
    }
  )

  const finishProjectAddWithDefaultCheckout = useEventCallback<FinishProjectAddWithDefaultCheckout>(
    async (options) => {
      await markOnboardingProjectAdded('addedRepo')
      options.closeModal()
      await openProjectDefaultCheckout(options)
    }
  )

  return { finishProjectAddWithDefaultCheckout, openProjectDefaultCheckout }
}

async function findDetectedDefaultCheckout(
  repo: Repo,
  catalog: ProjectWorktreeCatalog,
  setExternalVisibility: (repo: Repo) => Promise<boolean>,
  refresh: (repo: Repo) => Promise<ProjectWorktreeCatalog>
): Promise<{
  catalog: ProjectWorktreeCatalog
  reason: DefaultCheckoutHandoffReason
  worktree: Worktree | null
}> {
  const detectedDefaultCheckout = getDetectedProjectDefaultCheckout(catalog.detected)
  if (!detectedDefaultCheckout) {
    return {
      catalog,
      reason:
        catalog.detected?.authoritative === true
          ? 'no_default_checkout'
          : 'no_authoritative_detection',
      worktree: null
    }
  }
  if (!detectedDefaultCheckout.visible && !(await setExternalVisibility(repo))) {
    return { catalog, reason: 'show_detected_default_failed', worktree: null }
  }
  const refreshed = await refresh(repo)
  const worktree = getProjectDefaultCheckout(refreshed.worktrees)
  return {
    catalog: refreshed,
    reason: worktree ? 'detected_default_checkout' : 'refreshed_default_missing',
    worktree
  }
}

async function revealDetectedHiddenLinkedExternalWorktrees(
  repo: Repo,
  catalog: ProjectWorktreeCatalog,
  setExternalVisibility: (repo: Repo) => Promise<boolean>,
  refresh: (repo: Repo) => Promise<ProjectWorktreeCatalog>
): Promise<DefaultCheckoutHandoffReason | null> {
  if (!hasDetectedHiddenLinkedExternalWorktrees(catalog.detected)) {
    return null
  }
  if (!(await setExternalVisibility(repo))) {
    return 'show_detected_linked_failed'
  }
  const refreshed = await refresh(repo)
  return refreshed.detected?.authoritative === true ? null : 'linked_external_refresh_failed'
}

function trackHandoffFallback(
  repoId: string,
  source: AddRepoDefaultCheckoutHandoffSource,
  reason: DefaultCheckoutHandoffReason
): void {
  track('add_repo_default_checkout_handoff', {
    source,
    result: 'revealed_project',
    reason
  })
  finalizeImportedRepoAfterSkip(useAppStore.getState(), repoId)
}
