import {
  getCommitMessageAgentCapability,
  resolveCommitMessageAgentChoice
} from '@agentstart/protocol/source-control/catalog/agents'
import { isCustomAgentId } from '@agentstart/protocol/source-control/custom-agent'
import type { FeatureWallTourDepthSummary } from '@agentstart/protocol/telemetry/feature-wall/depth'
import type { AgentsStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { FeatureWallWorkflowId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { ReviewStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { WorkbenchStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { useEffect, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'

import {
  FEATURE_WALL_AGENT_STEP_IDS,
  FEATURE_WALL_REVIEW_STEP_IDS,
  FEATURE_WALL_WORKBENCH_STEP_IDS,
  getFeatureWallCompletionProgress
} from './completion-progress'
import { hasFeatureWallUsageTracking } from './usage-tracking'
import { useFeatureWallSessionDepth } from './use-feature-wall-session-depth'
import { usePersistedFeatureWallCompletion } from './use-persisted-feature-wall-completion'

export type FeatureWallCompletionState = {
  workflowDone: Record<FeatureWallWorkflowId, boolean>
  agentStepDone: Record<AgentsStepId, boolean>
  workbenchStepDone: Record<WorkbenchStepId, boolean>
  reviewStepDone: Record<ReviewStepId, boolean>
  markWorkflowVisited: (id: FeatureWallWorkflowId) => void
  markAgentStepVisited: (id: AgentsStepId) => void
  markWorkbenchStepVisited: (id: WorkbenchStepId) => void
  markReviewStepVisited: (id: ReviewStepId) => void
  refreshUsageAccountState: () => Promise<void>
  getTourDepthSummary: () => FeatureWallTourDepthSummary
}

export function useFeatureWallCompletion(
  isOpen: boolean,
  orchestrationSkillInstalled: boolean,
  browserUseSkillInstalled: boolean,
  options: { onTourDepthSummaryChange?: (summary: FeatureWallTourDepthSummary) => void } = {}
): FeatureWallCompletionState {
  const { onTourDepthSummaryChange } = options
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()
  const preflightStatus = useAppStore((s) => s.preflightStatus)
  const rateLimits = useAppStore((s) => s.rateLimits)
  const fetchRateLimits = useAppStore((s) => s.fetchRateLimits)
  const githubConfigured =
    preflightStatus?.gh.installed === true && preflightStatus.gh.authenticated === true
  const commitMessageAi = settings?.commitMessageAi
  const resolvedCommitMessageAgent =
    settings && commitMessageAi?.enabled === true
      ? resolveCommitMessageAgentChoice(
          commitMessageAi.agentId,
          settings.defaultTuiAgent,
          settings.disabledTuiAgents
        )
      : null
  const aiCommitPrConfigured =
    commitMessageAi?.enabled === true &&
    (isCustomAgentId(resolvedCommitMessageAgent)
      ? (commitMessageAi.customAgentCommand ?? '').trim().length > 0
      : resolvedCommitMessageAgent
        ? getCommitMessageAgentCapability(resolvedCommitMessageAgent) !== undefined
        : false)

  const [hasUsageAccount, setHasUsageAccount] = useState(false)
  const persistedCompletion = usePersistedFeatureWallCompletion()
  const {
    visitedWorkflows,
    visitedAgentSteps,
    visitedWorkbenchSteps,
    visitedReviewSteps,
    completedWorkflows,
    completedAgentSteps,
    completedWorkbenchSteps,
    completedReviewSteps,
    markWorkflowVisited,
    markAgentStepVisited,
    markWorkbenchStepVisited,
    markReviewStepVisited,
    markWorkflowCompleted,
    markAgentStepCompleted,
    markWorkbenchStepCompleted,
    markReviewStepCompleted
  } = persistedCompletion

  const readUsageAccountState = useEventCallback(async (): Promise<boolean> => {
    const [claude, codex] = await Promise.all([
      shellClient.accounts.claude.list().catch(() => null),
      shellClient.accounts.codex.list().catch(() => null)
    ])
    return hasFeatureWallUsageTracking({
      claudeManagedAccountCount: claude?.accounts.length ?? 0,
      codexManagedAccountCount: codex?.accounts.length ?? 0,
      claudeRateLimits: rateLimits.claude,
      codexRateLimits: rateLimits.codex
    })
  })

  const refreshUsageAccountState = async (): Promise<void> => {
    const nextHasUsageAccount = await readUsageAccountState()
    if (mountedRef.current) {
      setHasUsageAccount(nextHasUsageAccount)
    }
  }

  const sessionDepth = useFeatureWallSessionDepth({
    isOpen,
    hasUsageAccount,
    orchestrationSkillInstalled,
    browserUseSkillInstalled,
    githubConfigured,
    aiCommitPrConfigured,
    onTourDepthSummaryChange
  })

  // Pull current account state once when the modal opens, then refresh on focus
  // after a sign-in flow that happens outside the modal.
  useEffect(() => {
    if (isOpen) {
      void fetchRateLimits()
    }
  }, [fetchRateLimits, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    let stale = false
    const refresh = async (): Promise<void> => {
      const nextHasUsageAccount = await readUsageAccountState()
      if (stale) {
        return
      }
      setHasUsageAccount(nextHasUsageAccount)
    }
    void refresh()
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      stale = true
      window.removeEventListener('focus', onFocus)
    }
  }, [isOpen, readUsageAccountState])

  const currentProgress = (() =>
    getFeatureWallCompletionProgress({
      visitedWorkflows,
      visitedAgentSteps,
      visitedWorkbenchSteps,
      visitedReviewSteps,
      hasUsageAccount,
      orchestrationSkillInstalled,
      browserUseSkillInstalled,
      githubConfigured,
      aiCommitPrConfigured
    }))()

  // Why: tour checkmarks are progress acknowledgements; once a user sees one
  // turn green, later setup polling should not make it disappear.
  useEffect(() => {
    if (!isOpen) {
      return
    }
    for (const id of Object.keys(currentProgress.workflowDone) as FeatureWallWorkflowId[]) {
      if (currentProgress.workflowDone[id] && !completedWorkflows.has(id)) {
        markWorkflowCompleted(id)
      }
    }
    for (const id of FEATURE_WALL_AGENT_STEP_IDS) {
      if (currentProgress.agentStepDone[id] && !completedAgentSteps.has(id)) {
        markAgentStepCompleted(id)
      }
    }
    for (const id of FEATURE_WALL_WORKBENCH_STEP_IDS) {
      if (currentProgress.workbenchStepDone[id] && !completedWorkbenchSteps.has(id)) {
        markWorkbenchStepCompleted(id)
      }
    }
    for (const id of FEATURE_WALL_REVIEW_STEP_IDS) {
      if (currentProgress.reviewStepDone[id] && !completedReviewSteps.has(id)) {
        markReviewStepCompleted(id)
      }
    }
  }, [
    completedAgentSteps,
    completedReviewSteps,
    completedWorkbenchSteps,
    completedWorkflows,
    currentProgress,
    isOpen,
    markAgentStepCompleted,
    markReviewStepCompleted,
    markWorkbenchStepCompleted,
    markWorkflowCompleted
  ])

  const { workflowDone, agentStepDone, workbenchStepDone, reviewStepDone } = (() =>
    getFeatureWallCompletionProgress({
      visitedWorkflows,
      visitedAgentSteps,
      visitedWorkbenchSteps,
      visitedReviewSteps,
      completedWorkflows,
      completedAgentSteps,
      completedWorkbenchSteps,
      completedReviewSteps,
      hasUsageAccount,
      orchestrationSkillInstalled,
      browserUseSkillInstalled,
      githubConfigured,
      aiCommitPrConfigured
    }))()

  const {
    markWorkflowVisitedForSession: markSessionWorkflowVisited,
    markAgentStepVisitedForSession: markSessionAgentStepVisited,
    markWorkbenchStepVisitedForSession: markSessionWorkbenchStepVisited,
    markReviewStepVisitedForSession: markSessionReviewStepVisited,
    getTourDepthSummary
  } = sessionDepth

  const markWorkflowVisitedForSession = (id: FeatureWallWorkflowId): void => {
    markWorkflowVisited(id)
    markSessionWorkflowVisited(id)
  }
  const markAgentStepVisitedForSession = (id: AgentsStepId): void => {
    markAgentStepVisited(id)
    markSessionAgentStepVisited(id)
  }
  const markWorkbenchStepVisitedForSession = (id: WorkbenchStepId): void => {
    markWorkbenchStepVisited(id)
    markSessionWorkbenchStepVisited(id)
  }
  const markReviewStepVisitedForSession = (id: ReviewStepId): void => {
    markReviewStepVisited(id)
    markSessionReviewStepVisited(id)
  }

  return {
    workflowDone,
    agentStepDone,
    workbenchStepDone,
    reviewStepDone,
    markWorkflowVisited: markWorkflowVisitedForSession,
    markAgentStepVisited: markAgentStepVisitedForSession,
    markWorkbenchStepVisited: markWorkbenchStepVisitedForSession,
    markReviewStepVisited: markReviewStepVisitedForSession,
    refreshUsageAccountState,
    getTourDepthSummary
  }
}
