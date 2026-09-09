import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { FeatureWallOpenSourceTelemetry } from '@yiru/protocol/telemetry/events/foundations'
import type { AgentsStepId } from '@yiru/protocol/telemetry/feature-wall/types'
import type { FeatureWallWorkflowId } from '@yiru/protocol/telemetry/feature-wall/types'
import type { ReviewStepId } from '@yiru/protocol/telemetry/feature-wall/types'
import type { WorkbenchStepId } from '@yiru/protocol/telemetry/feature-wall/types'
import type { JSX, KeyboardEvent, MutableRefObject, ReactNode } from 'react'
import { translate } from '~renderer/i18n/i18n'
import type { InstalledAgentSkillState } from '~renderer/skills/use-installed-agents'
import { cn } from '~renderer/ui/class-names'

import { FeatureWallBody } from './body'
import type { AgentsStep } from './content/agents-orchestration-steps'
import type { ReviewStep } from './content/review-steps'
import type { WorkbenchStep } from './content/workbench-steps'
import type { FeatureWallWorkflow } from './content/workflows'
import { FeatureWallRail } from './rail'
import type { FeatureWallCompletionState } from './use-feature-wall-completion'

export type FeatureWallActiveStepCopy = {
  title: string
  description: string
  optional: boolean
}

export function FeatureWallTourPanel(props: {
  className?: string
  panelClassName?: string
  detachedFooter: boolean
  compactRail: boolean
  previewPanelId: string
  previewTitleId: string
  selected: FeatureWallWorkflow
  description: string
  activeStepCopy: FeatureWallActiveStepCopy | null
  completion: FeatureWallCompletionState
  railRefs: MutableRefObject<(HTMLButtonElement | null)[]>
  onSelectWorkflow: (workflow: FeatureWallWorkflow) => void
  onRailKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void
  agentsSteps: readonly AgentsStep[]
  agentsActiveStep: AgentsStep | null
  onSelectAgentsStep: (id: AgentsStepId) => void
  workbenchSteps: readonly WorkbenchStep[]
  workbenchActiveStep: WorkbenchStep | null
  onSelectWorkbenchStep: (id: WorkbenchStepId) => void
  reviewSteps: readonly ReviewStep[]
  reviewActiveStep: ReviewStep | null
  onSelectReviewStep: (id: ReviewStepId) => void
  prefersReducedMotion: boolean
  source: FeatureWallOpenSourceTelemetry
  orchestrationSkill: InstalledAgentSkillState
  browserUseSkill: InstalledAgentSkillState
  settings: GlobalSettings | null
  updateSettings: (updates: Partial<GlobalSettings>) => void
  footerText: string | null
  continueButton: ReactNode
  leadingFooterContent?: ReactNode
}): JSX.Element {
  // Why: the tour should not slide horizontally between pages; individual
  // visuals can adapt inside the stage, but the page anchor must stay fixed.
  const contentStageClassName = 'mx-auto w-full max-w-[940px]'
  const previewTitle = props.activeStepCopy?.title ?? props.selected.title
  const panel = (
    <div
      className={cn(
        'grid min-h-0 overflow-hidden',
        props.detachedFooter ? 'grid-rows-[minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)_auto]',
        props.detachedFooter ? props.panelClassName : props.className
      )}
    >
      <div
        className={cn(
          'grid min-h-0 grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1',
          props.compactRail
            ? 'md:grid-cols-[210px_minmax(0,1fr)] lg:grid-cols-[225px_minmax(0,1fr)]'
            : 'md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]'
        )}
      >
        <div className="md:border-border min-h-0 md:border-r">
          <FeatureWallRail
            selectedId={props.selected.id as FeatureWallWorkflowId}
            previewPanelId={props.previewPanelId}
            railRefs={props.railRefs}
            onSelect={props.onSelectWorkflow}
            onRailKeyDown={props.onRailKeyDown}
            workflowDone={props.completion.workflowDone}
            agentsSteps={props.agentsSteps}
            agentsActiveStepId={props.agentsActiveStep?.id ?? null}
            agentStepDone={props.completion.agentStepDone}
            onSelectAgentsStep={props.onSelectAgentsStep}
            workbenchSteps={props.workbenchSteps}
            workbenchActiveStepId={props.workbenchActiveStep?.id ?? null}
            workbenchStepDone={props.completion.workbenchStepDone}
            onSelectWorkbenchStep={props.onSelectWorkbenchStep}
            reviewSteps={props.reviewSteps}
            reviewActiveStepId={props.reviewActiveStep?.id ?? null}
            reviewStepDone={props.completion.reviewStepDone}
            onSelectReviewStep={props.onSelectReviewStep}
          />
        </div>

        <section
          id={props.previewPanelId}
          role="tabpanel"
          className="scrollbar-sleek grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-y-auto"
          aria-labelledby={props.previewTitleId}
        >
          <div className={cn(contentStageClassName, 'px-8 pb-3 pt-6 text-center')}>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <h3
                id={props.previewTitleId}
                className="text-2xl leading-tight font-semibold tracking-tight"
              >
                {previewTitle}
              </h3>
              {props.activeStepCopy?.optional ? (
                <span className="border-border bg-background text-muted-foreground border px-2 py-0.5 text-[11px] font-medium">
                  {translate(
                    'auto.components.feature.wall.FeatureWallTourPanel.af7d622f6f',
                    'Optional'
                  )}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground mx-auto mt-3 max-w-[56ch] text-sm leading-relaxed">
              {props.description}
            </p>
          </div>

          <div className={contentStageClassName}>
            <FeatureWallBody
              selected={props.selected}
              prefersReducedMotion={props.prefersReducedMotion}
              source={props.source}
              agentsActiveStep={props.agentsActiveStep}
              workbenchActiveStep={props.workbenchActiveStep}
              reviewActiveStep={props.reviewActiveStep}
              orchestrationSkill={props.orchestrationSkill}
              browserUseSkill={props.browserUseSkill}
              onUsageAccountStateChange={props.completion.refreshUsageAccountState}
              settings={props.settings}
              updateSettings={props.updateSettings}
            />
          </div>
        </section>
      </div>

      {!props.detachedFooter ? (
        <footer className="border-border bg-card/50 flex items-center justify-between border-t px-4 py-3 sm:px-7">
          {props.leadingFooterContent ? (
            props.leadingFooterContent
          ) : props.footerText ? (
            <span className="text-muted-foreground text-xs">{props.footerText}</span>
          ) : (
            <span />
          )}
          {props.continueButton}
        </footer>
      ) : null}
    </div>
  )

  if (props.detachedFooter) {
    return (
      <div className={cn('grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3', props.className)}>
        {panel}
        <div className="flex items-center justify-between gap-3">
          {props.leadingFooterContent ?? <span />}
          {props.continueButton}
        </div>
      </div>
    )
  }

  return panel
}
