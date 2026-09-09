import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { FeatureWallOpenSourceTelemetry } from '@yiru/protocol/telemetry/events/foundations'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import type { InstalledAgentSkillState } from '~renderer/skills/use-installed-agents'
import { cn } from '~renderer/ui/class-names'

import { GitHubRow } from '../onboarding/integrations-step'
import { OrchestrationSetupCard } from '../settings/orchestration/setup-card'
import { AgentsOrchestrationVisual } from './agents-orchestration-visual'
import { UsageAccountsCard } from './agents-orchestration/usage-accounts-card'
import { AiCommitPrSettingsCard } from './ai-commit-pr-settings-card'
import { BrowserAnimatedVisual } from './browser-animated-visual'
import { BrowserUseSkillSetupCard } from './browser-use-skill-setup-card'
import type { AgentsStep } from './content/agents-orchestration-steps'
import type { ReviewStep } from './content/review-steps'
import type { WorkbenchStep } from './content/workbench-steps'
import type { FeatureWallWorkflow } from './content/workflows'
import { EditorAnimatedVisual } from './editor-animated-visual'
import { KeepAwakeCard } from './keep-awake-card'
import { ReviewAnimatedVisual } from './review-animated-visual'
import { WorkbenchAnimatedVisual } from './workbench-animated-visual'
import { WorkspacesAnimatedVisual } from './workspaces-animated-visual'

export function FeatureWallBody(props: {
  selected: FeatureWallWorkflow
  prefersReducedMotion: boolean
  source: FeatureWallOpenSourceTelemetry
  agentsActiveStep: AgentsStep | null
  workbenchActiveStep: WorkbenchStep | null
  reviewActiveStep: ReviewStep | null
  orchestrationSkill: InstalledAgentSkillState
  browserUseSkill: InstalledAgentSkillState
  onUsageAccountStateChange: () => void | Promise<void>
  settings: GlobalSettings | null
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): JSX.Element {
  const {
    selected,
    prefersReducedMotion,
    source,
    agentsActiveStep,
    workbenchActiveStep,
    reviewActiveStep,
    orchestrationSkill,
    browserUseSkill,
    onUsageAccountStateChange
  } = props
  const isWorkspaces = selected.id === 'workspaces'
  const isAgents = selected.id === 'agents-orchestration'
  const isWorkbench = selected.id === 'workbench'
  const isReview = selected.id === 'review'
  const isAgentsUsage = isAgents && agentsActiveStep?.id === 'usage'
  const isAgentsStatuses = isAgents && agentsActiveStep?.id === 'statuses'
  const isAgentsOrchestration = isAgents && agentsActiveStep?.id === 'orchestration'
  const isWorkbenchEditor = isWorkbench && workbenchActiveStep?.id === 'editor'
  const isWorkbenchBrowser = isWorkbench && workbenchActiveStep?.id === 'browser'
  const isReviewPrView = isReview && reviewActiveStep?.id === 'pr-view'
  const isReviewShip = isReview && reviewActiveStep?.id === 'ship'
  const isOnboardingUsage = isAgentsUsage && source === 'onboarding'
  const isOnboardingStatuses = isAgentsStatuses && source === 'onboarding'
  const isOnboardingWorkbenchBrowser = isWorkbenchBrowser && source === 'onboarding'
  const isReviewSettingStep = isReviewPrView || isReviewShip
  const isOnboardingOrchestration = isAgentsOrchestration && source === 'onboarding'
  const orchestrationVisualWidthPx = isOnboardingOrchestration ? 440 : 520
  const orchestrationVisualHeightPx = isOnboardingOrchestration ? 240 : 392
  const animatedVisualWidth = isWorkspaces
    ? 'w-[440px]'
    : isWorkbenchEditor
      ? 'w-[600px]'
      : isWorkbenchBrowser
        ? isOnboardingWorkbenchBrowser
          ? 'w-[460px]'
          : 'w-[480px]'
        : isWorkbench
          ? 'w-[560px]'
          : isReview
            ? 'w-[480px]'
            : isAgentsUsage
              ? isOnboardingUsage
                ? 'w-[360px]'
                : 'w-[400px]'
              : isAgentsStatuses
                ? 'w-[420px]'
                : isAgentsOrchestration
                  ? isOnboardingOrchestration
                    ? 'w-[440px]'
                    : 'w-[520px]'
                  : 'w-[520px]'
  const settingWidth = isAgentsUsage
    ? isOnboardingUsage
      ? 'max-w-[400px]'
      : 'max-w-[440px]'
    : isAgentsStatuses
      ? isOnboardingStatuses
        ? 'max-w-[360px]'
        : 'max-w-[520px]'
      : isAgentsOrchestration
        ? isOnboardingOrchestration
          ? 'max-w-[360px]'
          : 'max-w-[400px]'
        : isReviewSettingStep
          ? 'max-w-[420px]'
          : isWorkbenchBrowser
            ? isOnboardingWorkbenchBrowser
              ? 'max-w-[340px]'
              : 'max-w-[400px]'
            : 'max-w-[480px]'
  const setupTerminalHeightPx = source === 'onboarding' ? 140 : 240
  const settingContent =
    isAgentsStatuses && props.settings ? (
      <KeepAwakeCard settings={props.settings} updateSettings={props.updateSettings} />
    ) : isAgentsUsage ? (
      <UsageAccountsCard onAccountStateChange={onUsageAccountStateChange} />
    ) : isAgentsOrchestration ? (
      <OrchestrationSetupCard
        compact
        terminalHeightPx={setupTerminalHeightPx}
        skill={orchestrationSkill}
      />
    ) : isWorkbenchBrowser ? (
      <BrowserUseSkillSetupCard
        compact
        terminalHeightPx={setupTerminalHeightPx}
        skill={browserUseSkill}
      />
    ) : isReviewPrView ? (
      <GitHubRow compact />
    ) : isReviewShip ? (
      <AiCommitPrSettingsCard />
    ) : null
  const shouldUseOnboardingTourZones = source === 'onboarding' && Boolean(settingContent)
  const shouldStickSetupToBottom = shouldUseOnboardingTourZones
  // Why: several visuals expand/collapse internally; setup controls should sit
  // after a stable stage so they do not jump with the animation loop.
  const visualStageHeight = isWorkbenchEditor
    ? 'h-[390px]'
    : isWorkbenchBrowser
      ? 'h-[270px]'
      : isWorkbench
        ? 'h-[340px]'
        : isReview
          ? 'h-[416px]'
          : isAgentsOrchestration
            ? isOnboardingOrchestration
              ? 'h-[240px]'
              : 'h-[392px]'
            : isAgentsStatuses
              ? isOnboardingStatuses
                ? 'h-[200px]'
                : 'h-[250px]'
              : isAgentsUsage
                ? isOnboardingUsage
                  ? 'h-[320px]'
                  : 'h-[392px]'
                : 'h-[330px]'
  const animatedVisual = isWorkspaces ? (
    <WorkspacesAnimatedVisual reducedMotion={prefersReducedMotion} />
  ) : isReview && reviewActiveStep ? (
    <ReviewAnimatedVisual reducedMotion={prefersReducedMotion} activeStepId={reviewActiveStep.id} />
  ) : isWorkbench ? (
    workbenchActiveStep?.id === 'editor' ? (
      <EditorAnimatedVisual reducedMotion={prefersReducedMotion} />
    ) : isWorkbenchBrowser ? (
      <BrowserAnimatedVisual reducedMotion={prefersReducedMotion} />
    ) : (
      <WorkbenchAnimatedVisual reducedMotion={prefersReducedMotion} />
    )
  ) : isAgentsOrchestration && agentsActiveStep ? (
    <AgentsOrchestrationVisual
      reducedMotion={prefersReducedMotion}
      activeStepId={agentsActiveStep.id}
      widthPx={orchestrationVisualWidthPx}
      heightPx={orchestrationVisualHeightPx}
    />
  ) : agentsActiveStep ? (
    <AgentsOrchestrationVisual
      reducedMotion={prefersReducedMotion}
      activeStepId={agentsActiveStep.id}
      widthPx={isAgentsUsage ? (isOnboardingUsage ? 360 : 400) : isAgentsStatuses ? 420 : undefined}
      heightPx={
        isAgentsUsage
          ? isOnboardingUsage
            ? 320
            : undefined
          : isAgentsStatuses
            ? isOnboardingStatuses
              ? 200
              : 250
            : undefined
      }
    />
  ) : null
  const animatedVisualNode = (
    <div className={cn('flex w-full items-start justify-center', visualStageHeight)}>
      <div
        className={cn(
          'max-w-full',
          animatedVisualWidth,
          isAgentsOrchestration && !isOnboardingOrchestration ? 'translate-x-6' : null
        )}
      >
        {animatedVisual}
      </div>
    </div>
  )
  const previewVisualNode = shouldUseOnboardingTourZones ? (
    <TourZone className="items-center">{animatedVisualNode}</TourZone>
  ) : (
    animatedVisualNode
  )

  return (
    <div className="flex min-h-full flex-col gap-4 px-8 pt-1 pb-0">
      <div className="grid grid-cols-1 items-start justify-items-center gap-7">
        {previewVisualNode}
      </div>
      {settingContent && shouldStickSetupToBottom ? (
        <div className="border-border bg-card sticky bottom-0 z-10 -mx-8 mt-auto border-t px-8 py-3">
          <TourZone
            className={cn(
              'scrollbar-sleek mx-auto max-h-[220px] w-full gap-2 overflow-y-auto',
              settingWidth
            )}
          >
            <>
              <div className="text-muted-foreground text-center text-[11px] font-semibold tracking-[0.05em] uppercase">
                {translate('auto.components.feature.wall.FeatureWallBody.25ec5356d6', 'Setup')}
              </div>
              {settingContent}
            </>
          </TourZone>
        </div>
      ) : settingContent ? (
        <TourZone className={cn('mx-auto w-full', settingWidth)}>{settingContent}</TourZone>
      ) : null}
    </div>
  )
}

function TourZone(props: { className?: string; children: JSX.Element | null }): JSX.Element {
  const { className, children } = props
  return <div className={cn('flex min-w-0 flex-col', className)}>{children}</div>
}
