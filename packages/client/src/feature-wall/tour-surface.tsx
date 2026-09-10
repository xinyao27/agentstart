import type { FeatureWallOpenSourceTelemetry } from '@agentstart/protocol/telemetry/events/foundations'
import type { FeatureWallTourDepthSummary } from '@agentstart/protocol/telemetry/feature-wall/depth'
import type { AgentsStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { FeatureWallWorkflowId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { ReviewStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { WorkbenchStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { useEffect, useId, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import {
  AGENTSTART_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from '~renderer/agent/feature-install-commands'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { getScreenSubmitModifierLabel } from '~renderer/keyboard-input/screen-submit-shortcut'
import { usePrefersReducedMotion } from '~renderer/react/use-prefers-reduced-motion'
import { useActiveProjectSkillRuntime } from '~renderer/skills/use-active-project-runtime'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '~renderer/skills/use-installed-agents'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'

import { getFeatureWallActiveStepCopy } from './active-step-copy'
import { getAgentsSteps } from './content/agents-orchestration-steps'
import { getReviewSteps } from './content/review-steps'
import { getWorkbenchSteps } from './content/workbench-steps'
import {
  DEFAULT_FEATURE_WALL_WORKFLOW_ID,
  getFeatureWallWorkflows,
  type FeatureWallWorkflow
} from './content/workflows'
import { FeatureWallContinueButton } from './continue-button'
import { FeatureWallTourPanel } from './tour-panel'
import { useFeatureWallCompletion } from './use-feature-wall-completion'
import { useFeatureWallTourKeyboardShortcut } from './use-feature-wall-tour-keyboard-shortcut'
import { useFeatureWallTourRailKeydown } from './use-feature-wall-tour-rail-keydown'
import { useFeatureWallTourTelemetry } from './use-feature-wall-tour-telemetry'

type FeatureWallTourSurfaceProps = {
  isOpen: boolean
  source: FeatureWallOpenSourceTelemetry
  onDone: (markSuccessfulExit?: () => void) => boolean | void | Promise<boolean | void>
  className?: string
  panelClassName?: string
  doneLabel?: string
  footerText?: string | null
  enableKeyboardShortcut?: boolean
  compactRail?: boolean
  detachedFooter?: boolean
  leadingFooterContent?: ReactNode
  onTourDepthSummaryChange?: (summary: FeatureWallTourDepthSummary) => void
}

function trackFeatureWallWorkflowSelection(
  workflow: FeatureWallWorkflow,
  source: FeatureWallOpenSourceTelemetry
): void {
  track('feature_wall_group_selected', { group_id: workflow.id, source })
  track('feature_wall_feature_selected', {
    group_id: workflow.id,
    tile_id: workflow.telemetryTileId,
    source
  })
  // Why: keep the legacy hover/focus event firing for analytics continuity
  // until dashboards are migrated to feature_selected.
  track('feature_wall_tile_focused', { tile_id: workflow.telemetryTileId })
}

export function FeatureWallTourSurface({
  isOpen,
  source,
  onDone,
  className,
  panelClassName,
  doneLabel = 'Done',
  footerText = 'Reopen any time from Help > Explore AgentStart.',
  enableKeyboardShortcut = true,
  compactRail = false,
  detachedFooter = false,
  leadingFooterContent,
  onTourDepthSummaryChange
}: FeatureWallTourSurfaceProps): JSX.Element | null {
  useUiLocale()
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const prefersReducedMotion = usePrefersReducedMotion()
  const reactId = useId()
  const previewPanelId = `${reactId}-feature-wall-preview-panel`
  const [selectedId, setSelectedId] = useState<FeatureWallWorkflowId>(
    DEFAULT_FEATURE_WALL_WORKFLOW_ID
  )
  const railRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectedIndex = (() =>
    Math.max(
      0,
      getFeatureWallWorkflows().findIndex((w) => w.id === selectedId)
    ))()
  const selected = getFeatureWallWorkflows()[selectedIndex]
  const agentsSteps = getAgentsSteps()
  const workbenchSteps = getWorkbenchSteps()
  const reviewSteps = getReviewSteps()
  const [agentsStepId, setAgentsStepId] = useState<AgentsStepId>(
    () => agentsSteps[0]?.id ?? 'statuses'
  )
  const [workbenchStepId, setWorkbenchStepId] = useState<WorkbenchStepId>(
    () => workbenchSteps[0]?.id ?? 'terminal'
  )
  const [reviewStepId, setReviewStepId] = useState<ReviewStepId>(
    () => reviewSteps[0]?.id ?? 'notes'
  )
  const [previousOpen, setPreviousOpen] = useState(isOpen)
  if (isOpen !== previousOpen) {
    setPreviousOpen(isOpen)
    if (!isOpen) {
      setSelectedId(DEFAULT_FEATURE_WALL_WORKFLOW_ID)
      setAgentsStepId(agentsSteps[0]?.id ?? 'statuses')
      setWorkbenchStepId(workbenchSteps[0]?.id ?? 'terminal')
      setReviewStepId(reviewSteps[0]?.id ?? 'notes')
    }
  }
  // Why: the feature-wall completion model owns skill-completion state, so read
  // installed skills here instead of asking child setup cards to notify upward
  // from passive Effects.
  const orchestrationSkill = useInstalledAgentSkill(ORCHESTRATION_SKILL_NAME, {
    enabled: isOpen,
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const browserUseSkill = useInstalledAgentSkill(AGENTSTART_CLI_SKILL_NAME, {
    enabled: isOpen,
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const completion = useFeatureWallCompletion(
    isOpen,
    orchestrationSkill.installed,
    browserUseSkill.installed,
    { onTourDepthSummaryChange }
  )
  const { markExitAction } = useFeatureWallTourTelemetry({
    isOpen,
    source,
    getDepthSummary: completion.getTourDepthSummary
  })
  const {
    markWorkflowVisited,
    markAgentStepVisited,
    markWorkbenchStepVisited,
    markReviewStepVisited
  } = completion

  const agentsActiveStep =
    selected.id === 'agents-orchestration'
      ? (agentsSteps.find((s) => s.id === agentsStepId) ?? agentsSteps[0] ?? null)
      : null
  const workbenchActiveStep =
    selected.id === 'workbench'
      ? (workbenchSteps.find((s) => s.id === workbenchStepId) ?? workbenchSteps[0] ?? null)
      : null
  const reviewActiveStep =
    selected.id === 'review'
      ? (reviewSteps.find((s) => s.id === reviewStepId) ?? reviewSteps[0] ?? null)
      : null
  const activeStepCopy = getFeatureWallActiveStepCopy(
    agentsActiveStep,
    workbenchActiveStep,
    reviewActiveStep
  )

  useEffect(() => {
    if (isOpen) {
      markWorkflowVisited(DEFAULT_FEATURE_WALL_WORKFLOW_ID)
      trackFeatureWallWorkflowSelection(getFeatureWallWorkflows()[0], source)
    }
  }, [isOpen, markWorkflowVisited, source])

  const handleSelect = (workflow: FeatureWallWorkflow): void => {
    markWorkflowVisited(workflow.id)
    if (workflow.id === selectedId) {
      return
    }
    setSelectedId(workflow.id)
    if (workflow.id === 'agents-orchestration') {
      const nextStepId = agentsSteps[0]?.id ?? 'statuses'
      markAgentStepVisited(nextStepId)
      setAgentsStepId(nextStepId)
    } else if (workflow.id === 'workbench') {
      const nextStepId = workbenchSteps[0]?.id ?? 'terminal'
      markWorkbenchStepVisited(nextStepId)
      setWorkbenchStepId(nextStepId)
    } else if (workflow.id === 'review') {
      const nextStepId = reviewSteps[0]?.id ?? 'notes'
      markReviewStepVisited(nextStepId)
      setReviewStepId(nextStepId)
    }
    trackFeatureWallWorkflowSelection(workflow, source)
  }

  const handleSelectAgentsStep = (id: AgentsStepId): void => {
    markAgentStepVisited(id)
    setAgentsStepId(id)
  }

  const handleSelectWorkbenchStep = (id: WorkbenchStepId): void => {
    markWorkbenchStepVisited(id)
    setWorkbenchStepId(id)
  }

  const handleSelectReviewStep = (id: ReviewStepId): void => {
    markReviewStepVisited(id)
    setReviewStepId(id)
  }

  const handleRailKeyDown = useFeatureWallTourRailKeydown({
    railRefs,
    onSelectWorkflow: handleSelect
  })

  const isLastWorkflow = selectedIndex >= getFeatureWallWorkflows().length - 1
  const agentsStepIndex =
    selected.id === 'agents-orchestration'
      ? agentsSteps.findIndex((step) => step.id === agentsStepId)
      : -1
  const workbenchStepIndex =
    selected.id === 'workbench'
      ? workbenchSteps.findIndex((step) => step.id === workbenchStepId)
      : -1
  const reviewStepIndex =
    selected.id === 'review' ? reviewSteps.findIndex((step) => step.id === reviewStepId) : -1
  const hasNextSubStep =
    (selected.id === 'agents-orchestration' &&
      (agentsStepIndex < 0 ? agentsSteps.length > 0 : agentsStepIndex < agentsSteps.length - 1)) ||
    (selected.id === 'workbench' &&
      (workbenchStepIndex < 0
        ? workbenchSteps.length > 0
        : workbenchStepIndex < workbenchSteps.length - 1)) ||
    (selected.id === 'review' &&
      (reviewStepIndex < 0 ? reviewSteps.length > 0 : reviewStepIndex < reviewSteps.length - 1))
  const continueLabel = isLastWorkflow && !hasNextSubStep ? doneLabel : 'Continue'
  const handleContinue = (): void => {
    markWorkflowVisited(selected.id)
    if (selected.id === 'agents-orchestration') {
      markAgentStepVisited(agentsStepId)
      const nextStep = agentsSteps[agentsStepIndex >= 0 ? agentsStepIndex + 1 : 0]
      if (nextStep) {
        markAgentStepVisited(nextStep.id)
        setAgentsStepId(nextStep.id)
        return
      }
    }
    if (selected.id === 'workbench') {
      markWorkbenchStepVisited(workbenchStepId)
      const nextStep = workbenchSteps[workbenchStepIndex >= 0 ? workbenchStepIndex + 1 : 0]
      if (nextStep) {
        markWorkbenchStepVisited(nextStep.id)
        setWorkbenchStepId(nextStep.id)
        return
      }
    }
    if (selected.id === 'review') {
      markReviewStepVisited(reviewStepId)
      const nextStep = reviewSteps[reviewStepIndex >= 0 ? reviewStepIndex + 1 : 0]
      if (nextStep) {
        markReviewStepVisited(nextStep.id)
        setReviewStepId(nextStep.id)
        return
      }
    }
    if (isLastWorkflow) {
      const exitAction = source === 'onboarding' ? 'onboarding_continue' : 'done'
      let markedSuccessfulExit = false
      const markSuccessfulExit = (): void => {
        if (markedSuccessfulExit) {
          return
        }
        markedSuccessfulExit = true
        markExitAction(exitAction)
      }
      const doneResult = onDone(markSuccessfulExit)
      if (doneResult instanceof Promise) {
        void doneResult.then((result) => result !== false && markSuccessfulExit())
      } else if (doneResult !== false) {
        markSuccessfulExit()
      }
      return
    }
    const nextWorkflow = getFeatureWallWorkflows()[selectedIndex + 1]
    if (nextWorkflow) {
      handleSelect(nextWorkflow)
      railRefs.current[selectedIndex + 1]?.focus()
    }
  }

  useFeatureWallTourKeyboardShortcut({
    isOpen,
    enabled: enableKeyboardShortcut,
    onContinue: handleContinue
  })

  if (!isOpen) {
    return null
  }

  const previewTitleId = `${reactId}-feature-wall-preview-${selected.id}`
  const description = activeStepCopy?.description ?? selected.lede
  const continueButton = (
    <FeatureWallContinueButton
      label={continueLabel}
      enableKeyboardShortcut={enableKeyboardShortcut}
      shortcutModifierLabel={getScreenSubmitModifierLabel()}
      onClick={handleContinue}
    />
  )

  return (
    <FeatureWallTourPanel
      className={className}
      panelClassName={panelClassName}
      detachedFooter={detachedFooter}
      compactRail={compactRail}
      previewPanelId={previewPanelId}
      previewTitleId={previewTitleId}
      selected={selected}
      description={description}
      activeStepCopy={activeStepCopy}
      completion={completion}
      railRefs={railRefs}
      onSelectWorkflow={handleSelect}
      onRailKeyDown={handleRailKeyDown}
      agentsSteps={agentsSteps}
      agentsActiveStep={agentsActiveStep}
      onSelectAgentsStep={handleSelectAgentsStep}
      workbenchSteps={workbenchSteps}
      workbenchActiveStep={workbenchActiveStep}
      onSelectWorkbenchStep={handleSelectWorkbenchStep}
      reviewSteps={reviewSteps}
      reviewActiveStep={reviewActiveStep}
      onSelectReviewStep={handleSelectReviewStep}
      prefersReducedMotion={prefersReducedMotion}
      source={source}
      orchestrationSkill={orchestrationSkill}
      browserUseSkill={browserUseSkill}
      settings={settings}
      updateSettings={updateSettings}
      footerText={footerText}
      continueButton={continueButton}
      leadingFooterContent={leadingFooterContent}
    />
  )
}
