import type { AgentsStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { FeatureWallWorkflowId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { ReviewStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { WorkbenchStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import {
  persistCompletedAgentStep,
  persistCompletedReviewStep,
  persistCompletedWorkbenchStep,
  persistCompletedWorkflow,
  persistVisitedAgentStep,
  persistVisitedReviewStep,
  persistVisitedWorkbenchStep,
  persistVisitedWorkflow,
  readPersistedCompletedAgentSteps,
  readPersistedCompletedReviewSteps,
  readPersistedCompletedWorkbenchSteps,
  readPersistedCompletedWorkflows,
  readPersistedVisitedAgentSteps,
  readPersistedVisitedReviewSteps,
  readPersistedVisitedWorkbenchSteps,
  readPersistedVisitedWorkflows
} from './completion-persistence'

export type PersistedFeatureWallCompletionState = {
  visitedWorkflows: Set<FeatureWallWorkflowId>
  visitedAgentSteps: Set<AgentsStepId>
  visitedWorkbenchSteps: Set<WorkbenchStepId>
  visitedReviewSteps: Set<ReviewStepId>
  completedWorkflows: Set<FeatureWallWorkflowId>
  completedAgentSteps: Set<AgentsStepId>
  completedWorkbenchSteps: Set<WorkbenchStepId>
  completedReviewSteps: Set<ReviewStepId>
  markWorkflowVisited: (id: FeatureWallWorkflowId) => void
  markAgentStepVisited: (id: AgentsStepId) => void
  markWorkbenchStepVisited: (id: WorkbenchStepId) => void
  markReviewStepVisited: (id: ReviewStepId) => void
  markWorkflowCompleted: (id: FeatureWallWorkflowId) => void
  markAgentStepCompleted: (id: AgentsStepId) => void
  markWorkbenchStepCompleted: (id: WorkbenchStepId) => void
  markReviewStepCompleted: (id: ReviewStepId) => void
}

function addToSet<T>(setValue: Dispatch<SetStateAction<Set<T>>>, id: T): void {
  setValue((prev) => {
    if (prev.has(id)) {
      return prev
    }
    const next = new Set(prev)
    next.add(id)
    return next
  })
}

export function usePersistedFeatureWallCompletion(): PersistedFeatureWallCompletionState {
  const [visitedWorkflows, setVisitedWorkflows] = useState<Set<FeatureWallWorkflowId>>(() =>
    readPersistedVisitedWorkflows()
  )
  const [visitedAgentSteps, setVisitedAgentSteps] = useState<Set<AgentsStepId>>(() =>
    readPersistedVisitedAgentSteps()
  )
  const [visitedWorkbenchSteps, setVisitedWorkbenchSteps] = useState<Set<WorkbenchStepId>>(() =>
    readPersistedVisitedWorkbenchSteps()
  )
  const [visitedReviewSteps, setVisitedReviewSteps] = useState<Set<ReviewStepId>>(() =>
    readPersistedVisitedReviewSteps()
  )
  const [completedWorkflows, setCompletedWorkflows] = useState<Set<FeatureWallWorkflowId>>(() =>
    readPersistedCompletedWorkflows()
  )
  const [completedAgentSteps, setCompletedAgentSteps] = useState<Set<AgentsStepId>>(() =>
    readPersistedCompletedAgentSteps()
  )
  const [completedWorkbenchSteps, setCompletedWorkbenchSteps] = useState<Set<WorkbenchStepId>>(() =>
    readPersistedCompletedWorkbenchSteps()
  )
  const [completedReviewSteps, setCompletedReviewSteps] = useState<Set<ReviewStepId>>(() =>
    readPersistedCompletedReviewSteps()
  )

  const markWorkflowVisited = (id: FeatureWallWorkflowId): void => {
    persistVisitedWorkflow(id)
    addToSet(setVisitedWorkflows, id)
  }
  const markAgentStepVisited = (id: AgentsStepId): void => {
    persistVisitedAgentStep(id)
    addToSet(setVisitedAgentSteps, id)
  }
  const markWorkbenchStepVisited = (id: WorkbenchStepId): void => {
    persistVisitedWorkbenchStep(id)
    addToSet(setVisitedWorkbenchSteps, id)
  }
  const markReviewStepVisited = (id: ReviewStepId): void => {
    persistVisitedReviewStep(id)
    addToSet(setVisitedReviewSteps, id)
  }
  const markWorkflowCompleted = (id: FeatureWallWorkflowId): void => {
    persistCompletedWorkflow(id)
    addToSet(setCompletedWorkflows, id)
  }
  const markAgentStepCompleted = (id: AgentsStepId): void => {
    persistCompletedAgentStep(id)
    addToSet(setCompletedAgentSteps, id)
  }
  const markWorkbenchStepCompleted = (id: WorkbenchStepId): void => {
    persistCompletedWorkbenchStep(id)
    addToSet(setCompletedWorkbenchSteps, id)
  }
  const markReviewStepCompleted = (id: ReviewStepId): void => {
    persistCompletedReviewStep(id)
    addToSet(setCompletedReviewSteps, id)
  }

  return {
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
  }
}
