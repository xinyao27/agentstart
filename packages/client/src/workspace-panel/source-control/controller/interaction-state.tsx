import type { GitConflictOperation } from '@agentstart/protocol/git/status-types'
import { isFolderRepo } from '@agentstart/protocol/project/repository'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import { useProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { resolveSourceControlLaunchPlatform } from '~renderer/source-control/agent-platform'
import { useAppStore } from '~renderer/store/state'
import { useConfirmationDialog } from '~renderer/ui/confirmation-dialog'
import {
  getCommitMessageGenerationRecordKey,
  type CommitMessageGenerationRecord
} from '~renderer/workspace-panel/commit-message-generation-state'
import {
  getPullRequestGenerationRecordKey,
  getPullRequestGenerationSeedRestoreKey
} from '~renderer/workspace-panel/pull-request-generation-state'

import type { SourceControlActionError } from '../action-error'
import { loadSessionCommitDrafts } from '../commit-draft-session'
import {
  createPrIntentCurrentTargetConflictsWithToken,
  type CreatePrIntentRunToken
} from '../create-pr-intent-flow'
import type { PendingDiscardConfirmation } from '../discard-dialog'
import { createDefaultCollapsedSections } from '../panel-constants'
import {
  normalizeSourceControlViewMode,
  readCommitDraftForWorktree,
  type CommitDraftsByWorktree
} from '../panel-state'
import type {
  CreatePrIntentNotice,
  HostedReviewCreationProviderHint,
  HostedReviewCreationRequestState,
  HostedReviewCreationState,
  SourceControlOperationTarget
} from '../panel-types'
import type { SourceControlScopeId } from '../scope-model'
import { resolveSourceControlGroupOrder } from '../section-order'
import { useSourceControlSubmoduleStatus } from '../use-submodule-status'
import type { SourceControlStoreStateController } from './store-state'

export function useSourceControlInteractionState(scope: SourceControlStoreStateController) {
  const projectRuntimeState = useProjectCatalogRuntimeState()
  const {
    activeRepo,
    activeRepoSettings,
    activeWorktree,
    activeWorktreeId,
    branchName,
    entries,
    isVisible,
    settings,
    worktreeMap
  } = scope
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    createDefaultCollapsedSections
  )
  const persistedSourceControlViewMode = normalizeSourceControlViewMode(
    settings?.sourceControlViewMode
  )
  const sourceControlViewMode = persistedSourceControlViewMode
  const sourceControlGroupOrder = resolveSourceControlGroupOrder(settings?.sourceControlGroupOrder)
  const [selectedScopeId, setSelectedScopeId] = useState<SourceControlScopeId | null>(null)
  const [collapsedTreeDirs, setCollapsedTreeDirs] = useState<Set<string>>(new Set())
  const [baseRefDialogOpen, setBaseRefDialogOpen] = useState(false)
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscardConfirmation | null>(null)
  const [defaultBaseRef, setDefaultBaseRef] = useState<string | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [commitDrafts, setCommitDrafts] = useState<CommitDraftsByWorktree>(() =>
    loadSessionCommitDrafts()
  )
  const commitDraftsRef = useRef<CommitDraftsByWorktree>(commitDrafts)
  const commitErrorsRef = useRef<Record<string, string | null>>({})
  const [commitErrors, setCommitErrors] = useState<Record<string, string | null>>({})
  const [remoteActionErrors, setRemoteActionErrors] = useState<
    Record<string, SourceControlActionError | null>
  >({})
  const remoteActionErrorSequenceByWorktreeRef = useRef<Record<string, number>>({})
  const [remoteActionSequenceByWorktree, setRemoteActionSequenceByWorktree] = useState<
    Record<string, number>
  >({})
  const beginRemoteActionSequence = useEventCallback((worktreeId: string): number => {
    const sequence = (remoteActionErrorSequenceByWorktreeRef.current[worktreeId] ?? 0) + 1
    remoteActionErrorSequenceByWorktreeRef.current[worktreeId] = sequence
    setRemoteActionSequenceByWorktree((current) => ({ ...current, [worktreeId]: sequence }))
    return sequence
  })
  const isCurrentRemoteActionSequence = useEventCallback(
    (worktreeId: string, sequence: number): boolean =>
      remoteActionErrorSequenceByWorktreeRef.current[worktreeId] === sequence
  )
  const pruneRemoteActionSequences = useEventCallback((worktreeIds: ReadonlySet<string>): void => {
    for (const key of Object.keys(remoteActionErrorSequenceByWorktreeRef.current)) {
      if (!worktreeIds.has(key)) {
        delete remoteActionErrorSequenceByWorktreeRef.current[key]
      }
    }
    setRemoteActionSequenceByWorktree((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => worktreeIds.has(key)))
    )
  })
  const previousConflictOperationsRef = useRef<Record<string, GitConflictOperation>>({})
  const [commitInFlightByWorktree, setCommitInFlightByWorktree] = useState<Record<string, boolean>>(
    {}
  )
  const [abortOperationInFlightByWorktree, setAbortOperationInFlightByWorktree] = useState<
    Record<string, boolean>
  >({})
  const isAbortingOperation = abortOperationInFlightByWorktree[activeWorktreeId ?? ''] ?? false
  const confirmAction = useConfirmationDialog()
  const isCommitting = commitInFlightByWorktree[activeWorktreeId ?? ''] ?? false
  const generateInFlightRef = useRef<Record<string, boolean>>({})
  const [generateInFlightByWorktree, setGenerateInFlightByWorktree] = useState<
    Record<string, boolean>
  >({})
  const [generateErrors, setGenerateErrors] = useState<Record<string, string | null>>({})
  const [hostedReviewCreationState, setHostedReviewCreationState] =
    useState<HostedReviewCreationState | null>(null)
  const [hostedReviewCreationRequestState, setHostedReviewCreationRequestState] =
    useState<HostedReviewCreationRequestState | null>(null)
  const [hostedReviewCreationProviderHint, setHostedReviewCreationProviderHint] =
    useState<HostedReviewCreationProviderHint>({
      repoId: null,
      worktreeId: null,
      branch: '',
      provider: 'github'
    })
  const createPrInFlightRef = useRef<Record<string, boolean>>({})
  const [createPrInFlightByWorktree, setCreatePrInFlightByWorktree] = useState<
    Record<string, boolean>
  >({})
  const isCreatingPr = createPrInFlightByWorktree[activeWorktreeId ?? ''] ?? false
  const createPrIntentInFlightRef = useRef<Record<string, boolean>>({})
  const createPrIntentRunTokenRef = useRef<Record<string, CreatePrIntentRunToken | null>>({})
  const createPrIntentCurrentTargetRef = useRef({
    repoId: null as string | null,
    worktreeId: null as string | null,
    worktreePath: null as string | null,
    branch: null as string | null,
    baseRef: null as string | null
  })
  const [createPrIntentInFlightByWorktree, setCreatePrIntentInFlightByWorktree] = useState<
    Record<string, boolean>
  >({})
  const [createPrIntentNotices, setCreatePrIntentNotices] = useState<
    Record<string, CreatePrIntentNotice | null>
  >({})
  const isCreatePrIntentInFlight = createPrIntentInFlightByWorktree[activeWorktreeId ?? ''] ?? false
  const createPrIntentNotice = createPrIntentNotices[activeWorktreeId ?? ''] ?? null
  const setCreatePrIntentNoticeForWorktree = (
    worktreeId: string,
    notice: CreatePrIntentNotice | null
  ): void => {
    setCreatePrIntentNotices((prev) => ({ ...prev, [worktreeId]: notice }))
  }
  const createPrIntentRunStillOwnsWorktree = (token: CreatePrIntentRunToken): boolean =>
    createPrIntentRunTokenRef.current[token.worktreeId] === token
  const createPrIntentActiveTargetConflicts = (token: CreatePrIntentRunToken): boolean =>
    createPrIntentCurrentTargetConflictsWithToken(token, createPrIntentCurrentTargetRef.current)
  const getCreatePrIntentOperationTarget = (
    token: CreatePrIntentRunToken
  ): SourceControlOperationTarget => ({
    // Why: Create PR intent continues after navigation; keep git commands
    // pinned to the worktree and runtime host that started the sequence.
    settings: activeRepoSettings,
    worktreeId: token.worktreeId,
    worktreePath: token.worktreePath,
    connectionId: getConnectionId(token.worktreeId) ?? undefined,
    pushTarget: worktreeMap.get(token.worktreeId)?.pushTarget
  })
  const prGenerationRecords = useAppStore((s) => s.pullRequestGenerationRecords)
  const allocatePullRequestGenerationRequestId = useAppStore(
    (s) => s.allocatePullRequestGenerationRequestId
  )
  const setPullRequestGenerationRecord = useAppStore((s) => s.setPullRequestGenerationRecord)
  const updatePullRequestGenerationRecord = useAppStore((s) => s.updatePullRequestGenerationRecord)
  const commitMessageGenerationRecords = useAppStore((s) => s.commitMessageGenerationRecords)
  const allocateCommitMessageGenerationRequestId = useAppStore(
    (s) => s.allocateCommitMessageGenerationRequestId
  )
  const setCommitMessageGenerationRecord = useAppStore((s) => s.setCommitMessageGenerationRecord)
  const updateCommitMessageGenerationRecord = useAppStore(
    (s) => s.updateCommitMessageGenerationRecord
  )
  const commitMessage = readCommitDraftForWorktree(commitDrafts, activeWorktreeId)
  const commitError = commitErrors[activeWorktreeId ?? ''] ?? null
  const remoteActionError = remoteActionErrors[activeWorktreeId ?? ''] ?? null
  const activeRemoteActionSequence = activeWorktreeId
    ? (remoteActionSequenceByWorktree[activeWorktreeId] ?? null)
    : null
  useEffect(() => {
    commitDraftsRef.current = commitDrafts
  }, [commitDrafts])
  const updateCommitDrafts = useCallback(
    (updater: (drafts: CommitDraftsByWorktree) => CommitDraftsByWorktree): void => {
      const next = updater(commitDraftsRef.current)
      // Why: Create PR intent reads this ref after awaits to avoid overwriting
      // user edits made before React's passive state sync effect runs.
      commitDraftsRef.current = next
      setCommitDrafts(next)
    },
    []
  )
  const setCommitErrorForWorktree = (worktreeId: string, message: string | null): void => {
    commitErrorsRef.current = { ...commitErrorsRef.current, [worktreeId]: message }
    setCommitErrors((prev) => ({ ...prev, [worktreeId]: message }))
  }
  const isFolder = activeRepo ? isFolderRepo(activeRepo) : false
  const worktreePath = activeWorktree?.path ?? null
  const { expandedSubmoduleKeys, submoduleStatusByKey, toggleSubmodule } =
    useSourceControlSubmoduleStatus({
      activeWorktreeId,
      worktreePath,
      activeRepoSettings,
      entries
    })
  const activeCommitMessageGenerationKey = getCommitMessageGenerationRecordKey(
    activeWorktreeId,
    worktreePath
  )
  const activeCommitMessageGenerationRecord: CommitMessageGenerationRecord | null =
    activeCommitMessageGenerationKey
      ? (commitMessageGenerationRecords[activeCommitMessageGenerationKey] ?? null)
      : null
  const isGenerating =
    activeCommitMessageGenerationRecord?.status === 'running' ||
    (generateInFlightByWorktree[activeWorktreeId ?? ''] ?? false)
  const generateError =
    activeCommitMessageGenerationRecord?.error ?? generateErrors[activeWorktreeId ?? ''] ?? null
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — getConnectionId already resolves to null for any found
  // repo, so a fallback read of activeRepo.connectionId can never differ.
  const activeConnectionId = activeWorktreeId ? (getConnectionId(activeWorktreeId) ?? null) : null
  const activeSourceControlLaunchPlatform = resolveSourceControlLaunchPlatform({
    connectionId: activeConnectionId,
    worktreePath,
    projectRuntime: activeConnectionId
      ? undefined
      : getLocalProjectExecutionRuntimeContext(projectRuntimeState, activeWorktreeId)
  })
  const activePullRequestGenerationKey = getPullRequestGenerationRecordKey({
    worktreeId: activeWorktreeId,
    worktreePath,
    repoId: activeRepo?.id,
    branch: branchName
  })
  const activePullRequestGenerationRecordCandidate = activePullRequestGenerationKey
    ? (prGenerationRecords[activePullRequestGenerationKey] ?? null)
    : null
  const activePullRequestGenerationRecord =
    activePullRequestGenerationRecordCandidate &&
    activePullRequestGenerationRecordCandidate.context.repoId === activeRepo?.id &&
    activePullRequestGenerationRecordCandidate.context.branch === branchName
      ? activePullRequestGenerationRecordCandidate
      : null
  const activePullRequestGenerationSeedRestoreKey = getPullRequestGenerationSeedRestoreKey({
    recordKey: activePullRequestGenerationKey,
    record: activePullRequestGenerationRecord
  })
  const isBranchVisible = isVisible
  return {
    ...scope,
    collapsedSections,
    setCollapsedSections,
    selectedScopeId,
    selectScope: setSelectedScopeId,
    persistedSourceControlViewMode,
    sourceControlViewMode,
    sourceControlGroupOrder,
    collapsedTreeDirs,
    setCollapsedTreeDirs,
    baseRefDialogOpen,
    setBaseRefDialogOpen,
    pendingDiscard,
    setPendingDiscard,
    defaultBaseRef,
    setDefaultBaseRef,
    filterQuery,
    setFilterQuery,
    commitDrafts,
    setCommitDrafts,
    commitDraftsRef,
    commitErrorsRef,
    commitErrors,
    setCommitErrors,
    remoteActionErrors,
    setRemoteActionErrors,
    beginRemoteActionSequence,
    isCurrentRemoteActionSequence,
    pruneRemoteActionSequences,
    previousConflictOperationsRef,
    commitInFlightByWorktree,
    setCommitInFlightByWorktree,
    abortOperationInFlightByWorktree,
    setAbortOperationInFlightByWorktree,
    isAbortingOperation,
    confirmAction,
    isCommitting,
    generateInFlightRef,
    generateInFlightByWorktree,
    setGenerateInFlightByWorktree,
    generateErrors,
    setGenerateErrors,
    hostedReviewCreationState,
    setHostedReviewCreationState,
    hostedReviewCreationRequestState,
    setHostedReviewCreationRequestState,
    hostedReviewCreationProviderHint,
    setHostedReviewCreationProviderHint,
    createPrInFlightRef,
    createPrInFlightByWorktree,
    setCreatePrInFlightByWorktree,
    isCreatingPr,
    createPrIntentInFlightRef,
    createPrIntentRunTokenRef,
    createPrIntentCurrentTargetRef,
    createPrIntentInFlightByWorktree,
    setCreatePrIntentInFlightByWorktree,
    createPrIntentNotices,
    setCreatePrIntentNotices,
    isCreatePrIntentInFlight,
    createPrIntentNotice,
    setCreatePrIntentNoticeForWorktree,
    createPrIntentRunStillOwnsWorktree,
    createPrIntentActiveTargetConflicts,
    getCreatePrIntentOperationTarget,
    prGenerationRecords,
    allocatePullRequestGenerationRequestId,
    setPullRequestGenerationRecord,
    updatePullRequestGenerationRecord,
    commitMessageGenerationRecords,
    allocateCommitMessageGenerationRequestId,
    setCommitMessageGenerationRecord,
    updateCommitMessageGenerationRecord,
    commitMessage,
    commitError,
    remoteActionError,
    activeRemoteActionSequence,
    updateCommitDrafts,
    setCommitErrorForWorktree,
    isFolder,
    worktreePath,
    expandedSubmoduleKeys,
    submoduleStatusByKey,
    toggleSubmodule,
    activeCommitMessageGenerationKey,
    activeCommitMessageGenerationRecord,
    isGenerating,
    generateError,
    activeConnectionId,
    activeSourceControlLaunchPlatform,
    activePullRequestGenerationKey,
    activePullRequestGenerationRecordCandidate,
    activePullRequestGenerationRecord,
    activePullRequestGenerationSeedRestoreKey,
    isBranchVisible
  }
}

export type SourceControlInteractionStateController = ReturnType<
  typeof useSourceControlInteractionState
>
