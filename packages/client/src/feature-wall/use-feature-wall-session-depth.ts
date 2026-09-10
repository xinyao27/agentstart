import type { FeatureWallTourDepthSummary } from '@agentstart/protocol/telemetry/feature-wall/depth'
import { buildFeatureWallTourDepthSummary } from '@agentstart/protocol/telemetry/feature-wall/depth'
import type { AgentsStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { FeatureWallWorkflowId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { ReviewStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { WorkbenchStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { useEffect, useRef } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { getFeatureWallCompletionProgress } from './completion-progress'

type FeatureWallSessionDepthInput = {
  isOpen: boolean
  hasUsageAccount: boolean
  orchestrationSkillInstalled: boolean
  browserUseSkillInstalled: boolean
  githubConfigured: boolean
  aiCommitPrConfigured: boolean
  onTourDepthSummaryChange?: (summary: FeatureWallTourDepthSummary) => void
}

export type FeatureWallSessionDepthTracker = {
  markWorkflowVisitedForSession: (id: FeatureWallWorkflowId) => void
  markAgentStepVisitedForSession: (id: AgentsStepId) => void
  markWorkbenchStepVisitedForSession: (id: WorkbenchStepId) => void
  markReviewStepVisitedForSession: (id: ReviewStepId) => void
  getTourDepthSummary: () => FeatureWallTourDepthSummary
}

export function useFeatureWallSessionDepth(
  input: FeatureWallSessionDepthInput
): FeatureWallSessionDepthTracker {
  const {
    isOpen,
    hasUsageAccount,
    orchestrationSkillInstalled,
    browserUseSkillInstalled,
    githubConfigured,
    aiCommitPrConfigured,
    onTourDepthSummaryChange
  } = input
  const sessionDepthRef = useRef<{
    visitedWorkflows: Set<FeatureWallWorkflowId>
    visitedAgentSteps: Set<AgentsStepId>
    visitedWorkbenchSteps: Set<WorkbenchStepId>
    visitedReviewSteps: Set<ReviewStepId>
    lastGroupId: FeatureWallWorkflowId | null
  }>({
    visitedWorkflows: new Set(),
    visitedAgentSteps: new Set(),
    visitedWorkbenchSteps: new Set(),
    visitedReviewSteps: new Set(),
    lastGroupId: null
  })

  const getTourDepthSummary = (): FeatureWallTourDepthSummary => {
    const session = sessionDepthRef.current
    const progress = getFeatureWallCompletionProgress({
      visitedWorkflows: session.visitedWorkflows,
      visitedAgentSteps: session.visitedAgentSteps,
      visitedWorkbenchSteps: session.visitedWorkbenchSteps,
      visitedReviewSteps: session.visitedReviewSteps,
      hasUsageAccount,
      orchestrationSkillInstalled,
      browserUseSkillInstalled,
      githubConfigured,
      aiCommitPrConfigured
    })
    return buildFeatureWallTourDepthSummary({
      ...progress,
      visitedWorkflows: session.visitedWorkflows,
      visitedAgentSteps: session.visitedAgentSteps,
      visitedWorkbenchSteps: session.visitedWorkbenchSteps,
      visitedReviewSteps: session.visitedReviewSteps,
      lastGroupId: session.lastGroupId
    })
  }

  const publishTourDepthSummary = useEventCallback((): void => {
    onTourDepthSummaryChange?.(getTourDepthSummary())
  })

  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      return
    }
    const openedNow = !wasOpenRef.current
    wasOpenRef.current = true
    if (openedNow) {
      // Why: depth telemetry is per explicit tour session; persisted completion
      // can color the UI but must not leak into current-session depth fields.
      sessionDepthRef.current = {
        visitedWorkflows: new Set(),
        visitedAgentSteps: new Set(),
        visitedWorkbenchSteps: new Set(),
        visitedReviewSteps: new Set(),
        lastGroupId: null
      }
    }
    publishTourDepthSummary()
  }, [isOpen, publishTourDepthSummary])

  const markWorkflowVisitedForSession = (id: FeatureWallWorkflowId): void => {
    const session = sessionDepthRef.current
    session.lastGroupId = id
    session.visitedWorkflows.add(id)
    publishTourDepthSummary()
  }
  const markAgentStepVisitedForSession = (id: AgentsStepId): void => {
    sessionDepthRef.current.visitedAgentSteps.add(id)
    publishTourDepthSummary()
  }
  const markWorkbenchStepVisitedForSession = (id: WorkbenchStepId): void => {
    sessionDepthRef.current.visitedWorkbenchSteps.add(id)
    publishTourDepthSummary()
  }
  const markReviewStepVisitedForSession = (id: ReviewStepId): void => {
    sessionDepthRef.current.visitedReviewSteps.add(id)
    publishTourDepthSummary()
  }

  return {
    markWorkflowVisitedForSession,
    markAgentStepVisitedForSession,
    markWorkbenchStepVisitedForSession,
    markReviewStepVisitedForSession,
    getTourDepthSummary
  }
}
