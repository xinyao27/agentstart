import type { AgentsStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { JSX } from 'react'
import { cn } from '~renderer/ui/class-names'

import { OrchestrationPage } from './agents-orchestration/orchestration-page'
import { StatusesPage } from './agents-orchestration/statuses-page'
import { UsagePage } from './agents-orchestration/usage-page'

const PANEL_HEIGHT_PX = 392
const PANEL_WIDTH_PX = 520

export function AgentsOrchestrationVisual(props: {
  reducedMotion: boolean
  activeStepId: AgentsStepId
  widthPx?: number
  heightPx?: number
  onCycleComplete?: () => void
  orchestrationCreatedChildCount?: number
  orchestrationLoopMs?: number
  orchestrationShowResponseBeats?: boolean
}): JSX.Element {
  const {
    reducedMotion,
    activeStepId,
    widthPx,
    heightPx,
    onCycleComplete,
    orchestrationCreatedChildCount,
    orchestrationLoopMs,
    orchestrationShowResponseBeats
  } = props
  return (
    <div
      className="text-foreground relative flex flex-col"
      style={{ width: widthPx ?? PANEL_WIDTH_PX, height: heightPx ?? PANEL_HEIGHT_PX }}
    >
      <Page active={activeStepId === 'statuses'}>
        <StatusesPage active={activeStepId === 'statuses'} reducedMotion={reducedMotion} />
      </Page>
      <Page active={activeStepId === 'usage'}>
        <UsagePage active={activeStepId === 'usage'} reducedMotion={reducedMotion} />
      </Page>
      <Page active={activeStepId === 'orchestration'}>
        <OrchestrationPage
          active={activeStepId === 'orchestration'}
          reducedMotion={reducedMotion}
          onCycleComplete={onCycleComplete}
          controlledCreatedChildCount={orchestrationCreatedChildCount}
          loopMs={orchestrationLoopMs}
          showResponseBeats={orchestrationShowResponseBeats}
        />
      </Page>
    </div>
  )
}

function Page(props: { active: boolean; children: JSX.Element }): JSX.Element {
  return (
    <div
      aria-hidden={!props.active}
      className={cn(
        'absolute inset-0 overflow-hidden transition-[opacity,transform] duration-[360ms] ease-out',
        props.active
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-1 opacity-0'
      )}
    >
      {props.children}
    </div>
  )
}
