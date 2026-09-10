import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { FeatureWallSetupStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { useEffect } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { Check } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { AgentStep } from '../onboarding/agent-step'
import { NotificationStep } from '../onboarding/notification-step'
import { AgentCapabilitiesSetupAction } from './agent-capabilities-setup-action'
import { BrowserAction } from './browser-action'
import type { FeatureWallSetupStep } from './content/setup-steps'
import { getFeatureWallSetupStepsForSection } from './content/setup-steps'
import type { FeatureWallSetupProgress } from './setup-progress'
import {
  SetupBrowserVisual,
  SetupMultipleReposVisual,
  SetupWorkspacesVisual
} from './setup-step-visuals'
import { AddReposAction, SetupScriptAction, WorkspacesAction } from './setup-workflow-actions'

type FeatureWallSetupChecklistLayout = 'modal' | 'embedded'

type FeatureWallSetupChecklistProps = {
  activeStep: FeatureWallSetupStep | null
  progress: FeatureWallSetupProgress
  onSelectStep: (id: FeatureWallSetupStepId) => void
  onOrchestrationSkillInstalledChange: (installed: boolean) => void
  onBrowserUseSkillInstalledChange: (installed: boolean) => void
  /** The embedded settings pane gives the checklist its own row so details can use the full width. */
  layout?: FeatureWallSetupChecklistLayout
}

function SetupStepRow(props: {
  step: FeatureWallSetupStep
  done: boolean
  active: boolean
  ordinal: number
  onSelect: () => void
  layout: FeatureWallSetupChecklistLayout
}): React.JSX.Element {
  const { step, done, active, ordinal, onSelect, layout } = props
  const isEmbedded = layout === 'embedded'
  return (
    <Button
      variant="outline"
      size="default"
      type="button"
      onClick={onSelect}
      aria-current={active ? 'step' : undefined}
      className={cn(
        'justify-start whitespace-normal font-normal relative flex w-full gap-3 text-left transition-colors',
        'focus-visible:outline-none',
        isEmbedded
          ? cn('px-3', active ? 'bg-accent text-accent-foreground' : '')
          : cn('px-3 py-2.5', active ? 'bg-accent text-accent-foreground' : '')
      )}
    >
      {active ? (
        <span className="bg-foreground absolute top-2 bottom-2 left-0 w-0.5 rounded-full" />
      ) : null}
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          done
            ? 'border-green-500/45 bg-green-500/10 text-green-600 dark:text-green-300'
            : 'border-border text-muted-foreground'
        )}
      >
        {done ? <Check className="size-3" /> : <span className="text-xs">{ordinal}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block text-[15px] leading-snug font-medium">
          {step.name}
        </span>
      </span>
    </Button>
  )
}

function SetupSection(props: {
  title: string
  steps: readonly FeatureWallSetupStep[]
  startOrdinal: number
  activeStepId: FeatureWallSetupStepId | null
  progress: FeatureWallSetupProgress
  onSelectStep: (id: FeatureWallSetupStepId) => void
  layout: FeatureWallSetupChecklistLayout
}): React.JSX.Element {
  const doneCount = props.steps.filter((step) => props.progress.stepDone[step.id]).length
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">
          {props.title}
        </h4>
        <span className="text-muted-foreground font-mono text-xs">
          {doneCount}/{props.steps.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {props.steps.map((step, index) => (
          <SetupStepRow
            key={step.id}
            step={step}
            done={props.progress.stepDone[step.id]}
            active={props.activeStepId === step.id}
            ordinal={props.startOrdinal + index}
            layout={props.layout}
            onSelect={() => props.onSelectStep(step.id)}
          />
        ))}
      </div>
    </section>
  )
}

function SelectedStepAction(props: FeatureWallSetupChecklistProps): React.JSX.Element | null {
  const { activeStep } = props
  if (!activeStep) {
    return null
  }
  const activeDone = props.progress.stepDone[activeStep.id]
  if (activeStep.id === 'default-agent') {
    return <DefaultAgentAction isEmbedded={props.layout === 'embedded'} />
  }
  if (activeStep.id === 'add-two-repos') {
    return <AddReposAction />
  }
  if (activeStep.id === 'notifications') {
    return <NotificationAction />
  }
  if (activeStep.id === 'two-worktrees') {
    return <WorkspacesAction done={activeDone} />
  }
  if (activeStep.id === 'browser') {
    return <BrowserAction done={activeDone} />
  }
  if (activeStep.id === 'agent-capabilities') {
    return (
      <AgentCapabilitiesSetupAction
        onOrchestrationSkillInstalledChange={props.onOrchestrationSkillInstalledChange}
        onBrowserUseSkillInstalledChange={props.onBrowserUseSkillInstalledChange}
      />
    )
  }
  if (activeStep.id === 'setup-script') {
    return <SetupScriptAction />
  }
  return null
}

function SelectedStepVisual(props: { stepId: FeatureWallSetupStepId }): React.JSX.Element | null {
  if (props.stepId === 'two-worktrees') {
    return <SetupWorkspacesVisual />
  }
  if (props.stepId === 'add-two-repos') {
    return <SetupMultipleReposVisual />
  }
  if (props.stepId === 'browser') {
    return <SetupBrowserVisual />
  }
  return null
}

function DefaultAgentAction(props: { isEmbedded: boolean }): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const refreshDetectedAgents = useAppStore((s) => s.refreshDetectedAgents)
  const detectedAgentIds = useAppStore((s) => s.detectedAgentIds)
  const isDetectingAgents = useAppStore((s) => s.isDetectingAgents || s.isRefreshingAgents)
  const selectedAgent =
    settings?.defaultTuiAgent && settings.defaultTuiAgent !== 'blank'
      ? settings.defaultTuiAgent
      : null
  const detectedSet = (() => new Set(detectedAgentIds ?? []))()
  const handleSelectAgent = (agent: TuiAgent) => {
    void updateSettings({ defaultTuiAgent: agent })
  }

  useEffect(() => {
    void refreshDetectedAgents()
  }, [refreshDetectedAgents])

  return (
    <div className="max-w-3xl">
      <AgentStep
        selectedAgent={selectedAgent}
        onSelect={handleSelectAgent}
        detectedSet={detectedSet}
        isDetecting={isDetectingAgents}
        isEmbedded={props.isEmbedded}
      />
    </div>
  )
}

function NotificationAction(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  return (
    <div className="max-w-3xl">
      <NotificationStep settings={settings} updateSettings={updateSettings} />
    </div>
  )
}

export function FeatureWallSetupChecklist(
  props: FeatureWallSetupChecklistProps
): React.JSX.Element {
  useUiLocale()
  const { activeStep, progress, onSelectStep, layout = 'modal' } = props
  const isEmbedded = layout === 'embedded'
  const activeDone = activeStep ? progress.stepDone[activeStep.id] : false
  // Only steps with a visual constrain the caption to a narrow column so the
  // illustration can sit beside it; captionless steps let the copy run full width.
  const hasStepVisual =
    activeStep?.id === 'two-worktrees' ||
    activeStep?.id === 'browser' ||
    activeStep?.id === 'add-two-repos'
  const setupSteps = getFeatureWallSetupStepsForSection('setup')
  const parallelWorkSteps = getFeatureWallSetupStepsForSection('parallel-work')
  const visualBreakpoint = isEmbedded ? 'xl' : 'sm'
  const visualGridClass =
    visualBreakpoint === 'xl'
      ? 'gap-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-12'
      : 'gap-8 sm:grid-cols-[minmax(0,48ch)_auto] sm:gap-10'

  // Why: settings needs one readable content column; the checklist sits above it
  // so the selected action is never squeezed by a permanent side rail.
  return (
    <div
      className={cn(
        isEmbedded
          ? 'flex min-w-0 flex-col gap-6'
          : 'grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-5 md:grid-cols-[minmax(190px,260px)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]'
      )}
    >
      <div
        className={cn(
          'min-w-0',
          isEmbedded
            ? 'grid shrink-0 grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-6'
            : 'scrollbar-sleek min-h-0 max-h-[min(18rem,40vh)] space-y-5 overflow-y-auto pr-1 md:max-h-none'
        )}
      >
        <SetupSection
          title={translate(
            'auto.components.feature.wall.FeatureWallSetupChecklist.1a6a7d6c80',
            'Setup'
          )}
          steps={setupSteps}
          startOrdinal={1}
          activeStepId={activeStep?.id ?? null}
          progress={progress}
          onSelectStep={onSelectStep}
          layout={layout}
        />
        <SetupSection
          title={translate(
            'auto.components.feature.wall.FeatureWallSetupChecklist.713cc529a5',
            'Milestones'
          )}
          steps={parallelWorkSteps}
          startOrdinal={setupSteps.length + 1}
          activeStepId={activeStep?.id ?? null}
          progress={progress}
          onSelectStep={onSelectStep}
          layout={layout}
        />
      </div>

      <section
        className={cn(
          'min-w-0',
          isEmbedded
            ? 'pt-2'
            : 'scrollbar-sleek min-h-0 overflow-y-auto border-t border-border pt-5 md:border-l md:border-t-0 md:pl-7 md:pt-0'
        )}
      >
        {activeStep ? (
          <div
            className={cn(
              'flex flex-col',
              !isEmbedded ? 'h-full' : null,
              isEmbedded ? 'gap-7' : 'gap-5'
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-foreground text-2xl leading-tight font-semibold">
                  {activeStep.name}
                </div>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium',
                  activeDone
                    ? 'border-green-500/45 bg-green-500/10 text-green-600 dark:text-green-300'
                    : 'border-border bg-muted/30 text-muted-foreground'
                )}
              >
                {activeDone
                  ? translate(
                      'auto.components.feature.wall.FeatureWallSetupChecklist.13294d3405',
                      'Done'
                    )
                  : translate(
                      'auto.components.feature.wall.FeatureWallSetupChecklist.0235b268b2',
                      'Not done yet'
                    )}
              </span>
            </div>
            <div
              className={cn(
                'grid items-start',
                hasStepVisual ? visualGridClass : 'max-w-3xl gap-5',
                !hasStepVisual && isEmbedded ? 'max-w-none' : null
              )}
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-base leading-relaxed text-muted-foreground',
                    hasStepVisual && !isEmbedded ? 'pr-4 sm:pr-6' : null
                  )}
                >
                  {activeStep.description}
                </p>
                {/* Action lives under the caption, not after the grid, so it sits just
                    below the copy instead of being pushed down by the taller visual. */}
                <div className={cn('min-w-0', isEmbedded ? 'mt-8' : 'mt-7')}>
                  <SelectedStepAction {...props} />
                </div>
              </div>
              <SelectedStepVisual stepId={activeStep.id} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
