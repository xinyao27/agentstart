import type { Repo } from '@agentstart/protocol/project/repository'
import type { DetectedWorktreeListResult } from '@agentstart/protocol/worktree/model'
import type { QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { refreshProjectCatalogWorktrees } from '~renderer/project-catalog/refresh'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'

import {
  keepImportedWorktreesHiddenCard,
  IMPORTED_WORKTREES_KEEP_HIDDEN_ERROR,
  showImportedWorktreesCard,
  type ImportedWorktreeCardActionState
} from '../imported-worktrees-card-actions'
import {
  buildImportedWorktreesCardCandidates,
  getHiddenImportedWorktrees
} from '../imported-worktrees-card-candidates'
import {
  importNewExternalWorktreeInboxPaths,
  keepNewExternalWorktreeInboxHidden,
  suppressNewExternalWorktreeInbox,
  type NewExternalWorktreesInboxActionState
} from '../new-external-worktrees-inbox-actions'
import { buildNewExternalWorktreesInboxCandidates } from '../new-external-worktrees-inbox-candidates'

export function useExternalWorktrees(args: {
  queryClient: QueryClient
  repos: readonly Repo[]
  visibleRepos: readonly Repo[]
  detectedByRepo: Record<string, DetectedWorktreeListResult | undefined>
  filterRepoIds: AppState['filterRepoIds']
}) {
  const updateRepo = useAppStore((state) => state.updateRepo)
  const openModal = useAppStore((state) => state.openModal)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const [importedActionState, setImportedActionState] = useState<
    Map<string, ImportedWorktreeCardActionState>
  >(new Map())
  const [inboxActionState, setInboxActionState] = useState<
    Map<string, NewExternalWorktreesInboxActionState>
  >(new Map())
  const [suppressedRepoId, setSuppressedRepoId] = useState<string | null>(null)
  const setImportedState = (
    repoId: string,
    state: ImportedWorktreeCardActionState | null
  ): void => {
    setImportedActionState((previous) => {
      const next = new Map(previous)
      if (state) {
        next.set(repoId, state)
      } else {
        next.delete(repoId)
      }
      return next
    })
  }
  const setInboxState = (
    repoId: string,
    state: NewExternalWorktreesInboxActionState | null
  ): void => {
    setInboxActionState((previous) => {
      const next = new Map(previous)
      if (state) {
        next.set(repoId, state)
      } else {
        next.delete(repoId)
      }
      return next
    })
  }
  const importedByRepo = buildImportedWorktreesCardCandidates({
    repos: args.visibleRepos,
    detectedWorktreesByRepo: args.detectedByRepo,
    filterRepoIds: args.filterRepoIds,
    forceVisibleRepoIds: new Set(
      [...importedActionState].filter(([, state]) => state.forceVisible).map(([repoId]) => repoId)
    )
  })
  const inboxByRepo = buildNewExternalWorktreesInboxCandidates({
    repos: args.visibleRepos,
    detectedWorktreesByRepo: args.detectedByRepo,
    filterRepoIds: args.filterRepoIds
  })
  const getInboxArgs = (repoId: string, worktreePaths: readonly string[]) => {
    const repo = args.repos.find((candidate) => candidate.id === repoId)
    return repo
      ? {
          repo,
          projectId: repoId,
          worktreePaths,
          updateRepo,
          refreshWorktrees: () =>
            refreshProjectCatalogWorktrees(args.queryClient, repo)
              .then(() => true)
              .catch(() => false),
          setInboxState
        }
      : null
  }
  const getInboxPaths = (repoId: string): string[] =>
    (inboxByRepo.get(repoId)?.inboxWorktrees ?? []).map((worktree) => worktree.path)
  const showImported = async (repoId: string): Promise<void> => {
    const repo = args.repos.find((candidate) => candidate.id === repoId)
    if (!repo) {
      return
    }
    await showImportedWorktreesCard({
      projectId: repoId,
      forceVisible: importedActionState.get(repoId)?.forceVisible === true,
      updateRepo,
      refreshWorktrees: () =>
        refreshProjectCatalogWorktrees(args.queryClient, repo)
          .then(() => true)
          .catch(() => false),
      setCardState: setImportedState
    })
  }
  const keepImportedHidden = async (repoId: string): Promise<void> => {
    const repo = args.repos.find((candidate) => candidate.id === repoId)
    let detected = args.detectedByRepo[repoId]
    if (detected?.authoritative !== true) {
      const refreshed = repo
        ? await refreshProjectCatalogWorktrees(args.queryClient, repo).catch(() => null)
        : null
      if (!refreshed) {
        setImportedState(repoId, { pending: false, error: IMPORTED_WORKTREES_KEEP_HIDDEN_ERROR })
        return
      }
      detected = refreshed.detected
    }
    if (detected?.authoritative !== true) {
      setImportedState(repoId, { pending: false, error: IMPORTED_WORKTREES_KEEP_HIDDEN_ERROR })
      return
    }
    await keepImportedWorktreesHiddenCard({
      projectId: repoId,
      updateRepo,
      setCardState: setImportedState,
      hiddenWorktreePaths: getHiddenImportedWorktrees(detected).map((worktree) => worktree.path),
      existingBaselinePaths: repo?.externalWorktreeInboxBaselinePaths
    })
  }
  const runInboxAction = async (
    repoId: string,
    action: typeof importNewExternalWorktreeInboxPaths | typeof keepNewExternalWorktreeInboxHidden,
    paths = getInboxPaths(repoId)
  ): Promise<void> => {
    const actionArgs = getInboxArgs(repoId, paths)
    if (actionArgs) {
      await action(actionArgs)
    }
  }
  const importOne = async (repoId: string, worktreeId: string): Promise<void> => {
    const worktree = inboxByRepo.get(repoId)?.inboxWorktrees.find((item) => item.id === worktreeId)
    if (worktree) {
      await runInboxAction(repoId, importNewExternalWorktreeInboxPaths, [worktree.path])
    }
  }
  const confirmSuppress = async (): Promise<void> => {
    if (!suppressedRepoId) {
      return
    }
    const actionArgs = getInboxArgs(suppressedRepoId, getInboxPaths(suppressedRepoId))
    if (!actionArgs || (await suppressNewExternalWorktreeInbox(actionArgs))) {
      setSuppressedRepoId(null)
    }
  }
  return {
    importedByRepo,
    inboxByRepo,
    importedActionState,
    inboxActionState,
    suppressedRepoId,
    closeSuppress: () => setSuppressedRepoId(null),
    showImported,
    keepImportedHidden,
    importOne,
    importAll: (repoId: string) => runInboxAction(repoId, importNewExternalWorktreeInboxPaths),
    keepInboxHidden: (repoId: string) => runInboxAction(repoId, keepNewExternalWorktreeInboxHidden),
    requestSuppress: setSuppressedRepoId,
    confirmSuppress,
    createForRepo: (repoId: string) =>
      openModal('new-workspace-composer', { initialRepoId: repoId, telemetrySource: 'sidebar' }),
    openVisibility: (repoId: string) => openModal('worktree-visibility', { repoId }),
    openRepoSettings: (repoId: string, sectionId?: string) => {
      openSettingsTarget({ pane: 'repo', repoId, ...(sectionId ? { sectionId } : {}) })
      openSettingsPage()
    },
    removeProject: (repo: Repo) =>
      openModal('confirm-remove-folder', { repoId: repo.id, displayName: repo.displayName })
  }
}
