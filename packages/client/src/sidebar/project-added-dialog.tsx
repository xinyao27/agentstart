import { useQueryClient } from '@tanstack/react-query'
import { isFolderRepo } from '@yiru/protocol/project/repository'
import { useEffect, useRef } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import {
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees
} from '~renderer/project-catalog/refresh'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { useProjectDefaultCheckoutHandoff } from './project-added-default-checkout'

type ProjectAddedModalData = {
  repoId?: string
  projectId?: string
}

export default function ProjectAddedDialog(): null {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData as ProjectAddedModalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const queryClient = useQueryClient()
  const { repos } = useProjectCatalog()
  const { finishProjectAddWithDefaultCheckout } = useProjectDefaultCheckoutHandoff()
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)
  const handoffRunRef = useRef(0)
  const pendingRepoHydrationRef = useRef<string | null>(null)

  // Why: older onboarding builds wrote `projectId`; accepting both prevents a
  // stale project-added modal from blocking follow-up contextual tours.
  const repoId =
    typeof modalData?.repoId === 'string'
      ? modalData.repoId
      : typeof modalData?.projectId === 'string'
        ? modalData.projectId
        : ''
  const repo = repos.find((candidate) => candidate.id === repoId) ?? null

  useEffect(() => {
    if (activeModal !== 'project-added') {
      handoffRunRef.current++
      pendingRepoHydrationRef.current = null
      return
    }
    if (!repoId) {
      closeModal()
      return
    }
    if (!repo) {
      if (pendingRepoHydrationRef.current === repoId) {
        return
      }
      pendingRepoHydrationRef.current = repoId
      let cancelled = false
      void (async () => {
        const target = getActiveRuntimeTarget(useAppStore.getState().settings)
        const refreshedRepos = await refreshProjectCatalogTargetRepos(queryClient, target)
        if (cancelled) {
          return
        }
        const hydratedRepo = refreshedRepos.find((candidate) => candidate.id === repoId)
        if (!hydratedRepo) {
          closeModal()
        }
        pendingRepoHydrationRef.current = null
      })()
      return () => {
        cancelled = true
        pendingRepoHydrationRef.current = null
      }
    }
    pendingRepoHydrationRef.current = null
    const runId = ++handoffRunRef.current

    let cancelled = false
    if (isFolderRepo(repo)) {
      void (async () => {
        let folderWorktree = null
        try {
          folderWorktree = (await refreshProjectCatalogWorktrees(queryClient, repo)).worktrees[0]
        } catch {
          // Why: folder compatibility exists to clear stale modal state; close
          // even if the best-effort synthetic workspace refresh fails.
        }
        if (cancelled) {
          return
        }
        if (folderWorktree) {
          activateAndRevealWorktree(folderWorktree.id, { sidebarRevealBehavior: 'auto' })
        }
        closeModal()
      })()
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      if (!cancelled && handoffRunRef.current === runId) {
        await finishProjectAddWithDefaultCheckout({
          project: repo,
          source: 'project_added_compat',
          closeModal,
          setHideDefaultBranchWorkspace
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    activeModal,
    closeModal,
    finishProjectAddWithDefaultCheckout,
    queryClient,
    repo,
    repoId,
    setHideDefaultBranchWorkspace
  ])

  return null
}
