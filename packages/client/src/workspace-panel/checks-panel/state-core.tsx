import type { PRCheckDetail, PRComment } from '@agentstart/protocol/hosted-review/review-types'
import type {
  SourceControlActionRecipe,
  SourceControlLaunchActionId
} from '@agentstart/protocol/source-control/ai-actions'
import { useEffect, useRef, useState } from 'react'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import { useProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { resolveSourceControlLaunchPlatform } from '~renderer/source-control/agent-platform'
import {
  saveSourceControlActionRecipe,
  type SourceControlAiWriteTarget
} from '~renderer/source-control/ai-recipe-save'
import { useActiveWorktree, useRepoById } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { getWorktreeGitIdentityDisplay } from '~renderer/worktree/git-identity-display'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import type { PRCommentsListSelectionClearRequest } from '../pr-comments-list-selection'
import type { HostedReviewCreationSnapshot, ChecksAgentComposerState } from './controller-types'
import {
  buildChecksPanelGitStatusContextKey,
  type ChecksPanelGitStatusSnapshot
} from './git-status-snapshot'
import { useChecksPanelTerminalWorktree } from './use-terminal-worktree'

export function useChecksPanelStateCore(isVisible: boolean) {
  const isPanelVisible = isVisible

  // Why: the active terminal can move across a stack, so checks follow its cwd
  // before falling back to the sidebar-selected worktree.
  const defaultActiveWorktree = useActiveWorktree()
  const { worktree: activeWorktree } = useChecksPanelTerminalWorktree({
    defaultActiveWorktree,
    isPanelVisible
  })
  const activeWorktreeId = activeWorktree?.id ?? null
  const repo = useRepoById(activeWorktree?.repoId ?? null)
  const projectRuntimeState = useProjectCatalogRuntimeState()
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — getConnectionId already resolves the live folder-workspace
  // case and falls back to null for a plain repo-backed worktree.
  const activeConnectionId = activeWorktreeId ? (getConnectionId(activeWorktreeId) ?? null) : null
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const fetchPRForBranch = useAppStore((s) => s.fetchPRForBranch)
  const fetchHostedReviewForBranch = useAppStore((s) => s.fetchHostedReviewForBranch)
  const expireGitHubPRRefreshState = useAppStore((s) => s.expireGitHubPRRefreshState)
  const getHostedReviewCreationEligibility = useAppStore(
    (s) => s.getHostedReviewCreationEligibility
  )
  const createHostedReview = useAppStore((s) => s.createHostedReview)
  const enqueueGitHubPRRefresh = useAppStore((s) => s.enqueueGitHubPRRefresh)
  const conflictOperation = useAppStore((s) =>
    activeWorktreeId ? (s.gitConflictOperationByWorktree[activeWorktreeId] ?? 'unknown') : 'unknown'
  )
  const gitStatusInvalidation = useAppStore((s) =>
    activeWorktreeId ? s.gitStatusByWorktree[activeWorktreeId] : undefined
  )
  const remoteStatusInvalidation = useAppStore((s) =>
    activeWorktreeId ? s.remoteStatusesByWorktree[activeWorktreeId] : undefined
  )
  const isRemoteOperationActive = useAppStore((s) => s.isRemoteOperationActive)
  const pushBranch = useAppStore((s) => s.pushBranch)
  const fetchUpstreamStatus = useAppStore((s) => s.fetchUpstreamStatus)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const updateWorktreeGitIdentity = useAppStore((s) => s.updateWorktreeGitIdentity)
  const openModal = useAppStore((s) => s.openModal)

  const fetchPRChecks = useAppStore((s) => s.fetchPRChecks)
  const fetchPRCheckDetails = useAppStore((s) => s.fetchPRCheckDetails)
  const fetchPRComments = useAppStore((s) => s.fetchPRComments)
  const addPRConversationComment = useAppStore((s) => s.addPRConversationComment)
  const addPRReviewCommentReply = useAppStore((s) => s.addPRReviewCommentReply)
  const resolveReviewThread = useAppStore((s) => s.resolveReviewThread)
  const detectedAgentIds = useAppStore((s) => s.detectedAgentIds)
  const remoteDetectedAgentIds = useAppStore((s) => {
    return typeof activeConnectionId === 'string'
      ? (s.remoteDetectedAgentIds[activeConnectionId] ?? null)
      : null
  })

  const [checks, setChecks] = useState<PRCheckDetail[]>([])
  const [checksLoading, setChecksLoading] = useState(false)
  const [comments, setComments] = useState<PRComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const commentsRef = useRef<PRComment[]>([])
  const [commentsSelectionClearRequest, setCommentsSelectionClearRequest] =
    useState<PRCommentsListSelectionClearRequest | null>(null)
  const commentsSelectionClearTokenRef = useRef(0)
  const [emptyRefreshing, setEmptyRefreshing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshInFlightRef = useRef(false)
  const [conflictDetailsRefreshing, setConflictDetailsRefreshing] = useState(false)
  const createPrInFlightRef = useRef<string | null>(null)
  const [isCreatingPr, setIsCreatingPr] = useState(false)
  const [createPrError, setCreatePrError] = useState<string | null>(null)
  const [isPublishingBranch, setIsPublishingBranch] = useState(false)
  const isResolvingConflictsWithAI = false
  const [isFixingChecksWithAI, setIsFixingChecksWithAI] = useState(false)
  const [agentComposerState, setAgentComposerState] = useState<ChecksAgentComposerState | null>(
    null
  )
  const [hostedReviewCreationSnapshot, setHostedReviewCreationSnapshot] =
    useState<HostedReviewCreationSnapshot | null>(null)
  const [gitStatusSnapshot, setGitStatusSnapshot] = useState<ChecksPanelGitStatusSnapshot | null>(
    null
  )
  const [gitStatusRefreshNonce, setGitStatusRefreshNonce] = useState(0)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleInputFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollIntervalRef = useRef(30_000) // start at 30s, backs off to 120s
  const mountedRef = useMountedRef()
  const prevChecksRef = useRef<string>('')
  const conflictSummaryRefreshKeyRef = useRef<string | null>(null)
  const panelVisibleSinceRef = useRef<number | null>(null)
  const prGenerationRecords = useAppStore((s) => s.pullRequestGenerationRecords)
  const allocatePullRequestGenerationRequestId = useAppStore(
    (s) => s.allocatePullRequestGenerationRequestId
  )
  const setPullRequestGenerationRecord = useAppStore((s) => s.setPullRequestGenerationRecord)
  const updatePullRequestGenerationRecord = useAppStore((s) => s.updatePullRequestGenerationRecord)

  const saveLaunchActionDefault = async (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe
  ): Promise<void> => {
    const latestSettings = useAppStore.getState().settings
    if (!latestSettings) {
      throw new Error('Settings are not loaded.')
    }
    const latestRepo =
      target.type === 'repo'
        ? (projectRuntimeState.repos.find((candidate) => candidate.id === target.repoId) ?? null)
        : null
    const result = saveSourceControlActionRecipe({
      target,
      settings: latestSettings,
      repo: latestRepo,
      actionId,
      recipe
    })
    if ('sourceControlAi' in result) {
      await updateSettings({ sourceControlAi: result.sourceControlAi })
      return
    }
    await updateRepo(result.target.repoId, result.update)
  }
  const asyncResultKeyRef = useRef<string>('')
  const refreshRequestKeyRef = useRef<string | null>(null)
  const refreshContextKeyRef = useRef<string | null>(null)
  const gitStatusSnapshotInFlightContextRef = useRef<string | null>(null)
  const gitStatusSnapshotRerunContextRef = useRef<string | null>(null)
  const gitStatusSnapshotRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gitIdentityDisplay = activeWorktree ? getWorktreeGitIdentityDisplay(activeWorktree) : null
  const detachedHeadDisplay = gitIdentityDisplay?.kind === 'detached' ? gitIdentityDisplay : null
  const branch = gitIdentityDisplay?.kind === 'branch' ? gitIdentityDisplay.branchName : ''
  const activeWorktreePath = activeWorktree?.path ?? null
  const activeWorktreePushTarget = activeWorktree?.pushTarget ?? null
  const activeSourceControlLaunchPlatform = resolveSourceControlLaunchPlatform({
    connectionId: activeConnectionId,
    worktreePath: activeWorktreePath,
    projectRuntime: activeConnectionId
      ? undefined
      : getLocalProjectExecutionRuntimeContext(projectRuntimeState, activeWorktreeId)
  })
  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
    projectRuntimeState,
    activeWorktreeId
  )
  const ownerSettings = (() =>
    !settings
      ? settings
      : runtimeEnvironmentId
        ? { ...settings, activeRuntimeEnvironmentId: runtimeEnvironmentId }
        : { ...settings, activeRuntimeEnvironmentId: null })()
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — a checks-panel repo is never remote.
  const repoConnectionId: string | null = null
  const panelContextKey = buildChecksPanelGitStatusContextKey({
    repoId: repo?.id,
    worktreeId: activeWorktreeId,
    worktreePath: activeWorktreePath,
    branch,
    linkedGitHubPR: activeWorktree?.linkedPR ?? null,
    runtimeEnvironmentId,
    repoConnectionId,
    pushTarget: activeWorktreePushTarget
  })
  const panelContextKeyRef = useRef(panelContextKey)

  useEffect(() => {
    commentsRef.current = comments
    panelContextKeyRef.current = panelContextKey
  }, [comments, panelContextKey])

  const clearTitleInputFocusTimer = (): void => {
    if (titleInputFocusTimerRef.current !== null) {
      clearTimeout(titleInputFocusTimerRef.current)
      titleInputFocusTimerRef.current = null
    }
  }

  const setChecksPanelContentRef = (node: HTMLDivElement | null) => {
    if (node === null) {
      clearTitleInputFocusTimer()
    }
  }

  return {
    isPanelVisible,
    defaultActiveWorktree,
    activeWorktree,
    activeWorktreeId,
    repo,
    activeConnectionId,
    settings,
    updateSettings,
    updateRepo,
    fetchPRForBranch,
    fetchHostedReviewForBranch,
    expireGitHubPRRefreshState,
    getHostedReviewCreationEligibility,
    createHostedReview,
    enqueueGitHubPRRefresh,
    conflictOperation,
    gitStatusInvalidation,
    remoteStatusInvalidation,
    isRemoteOperationActive,
    pushBranch,
    fetchUpstreamStatus,
    updateWorktreeMeta,
    updateWorktreeGitIdentity,
    openModal,
    fetchPRChecks,
    fetchPRCheckDetails,
    fetchPRComments,
    addPRConversationComment,
    addPRReviewCommentReply,
    resolveReviewThread,
    detectedAgentIds,
    remoteDetectedAgentIds,
    checks,
    setChecks,
    checksLoading,
    setChecksLoading,
    comments,
    setComments,
    commentsLoading,
    setCommentsLoading,
    commentsRef,
    commentsSelectionClearRequest,
    setCommentsSelectionClearRequest,
    commentsSelectionClearTokenRef,
    emptyRefreshing,
    setEmptyRefreshing,
    isRefreshing,
    setIsRefreshing,
    refreshInFlightRef,
    conflictDetailsRefreshing,
    setConflictDetailsRefreshing,
    createPrInFlightRef,
    isCreatingPr,
    setIsCreatingPr,
    createPrError,
    setCreatePrError,
    isPublishingBranch,
    setIsPublishingBranch,
    isResolvingConflictsWithAI,
    isFixingChecksWithAI,
    setIsFixingChecksWithAI,
    agentComposerState,
    setAgentComposerState,
    hostedReviewCreationSnapshot,
    setHostedReviewCreationSnapshot,
    gitStatusSnapshot,
    setGitStatusSnapshot,
    gitStatusRefreshNonce,
    setGitStatusRefreshNonce,
    editingTitle,
    setEditingTitle,
    titleDraft,
    setTitleDraft,
    titleSaving,
    setTitleSaving,
    titleInputRef,
    titleInputFocusTimerRef,
    pollIntervalRef,
    mountedRef,
    prevChecksRef,
    conflictSummaryRefreshKeyRef,
    panelVisibleSinceRef,
    prGenerationRecords,
    allocatePullRequestGenerationRequestId,
    setPullRequestGenerationRecord,
    updatePullRequestGenerationRecord,
    saveLaunchActionDefault,
    asyncResultKeyRef,
    refreshRequestKeyRef,
    refreshContextKeyRef,
    gitStatusSnapshotInFlightContextRef,
    gitStatusSnapshotRerunContextRef,
    gitStatusSnapshotRetryTimerRef,
    gitIdentityDisplay,
    detachedHeadDisplay,
    branch,
    activeWorktreePath,
    activeWorktreePushTarget,
    activeSourceControlLaunchPlatform,
    runtimeEnvironmentId,
    ownerSettings,
    repoConnectionId,
    panelContextKey,
    panelContextKeyRef,
    clearTitleInputFocusTimer,
    setChecksPanelContentRef
  }
}

export type useChecksPanelStateCoreState = ReturnType<typeof useChecksPanelStateCore>
