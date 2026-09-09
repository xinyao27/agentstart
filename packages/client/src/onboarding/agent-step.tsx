import type { TuiAgent } from '@yiru/protocol/agent/types'
import { useLayoutEffect, useRef, useState } from 'react'
import { getAgentCatalog, AgentIcon, type AgentCatalogEntry } from '~renderer/agent/catalog'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { Check, Info, ArrowSquareOut as ExternalLink } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Checkbox } from '~renderer/ui/checkbox'
import { cn } from '~renderer/ui/class-names'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~renderer/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

const AGENT_GRID_MAX_ROWS = 4

type AgentStepProps = {
  selectedAgent: TuiAgent | null
  // `fromCollapsedSection` tells the controller whether the click happened
  // under the `<details>` disclosure so `onboarding_agent_picked` can carry
  // it without re-deriving from props at the emit site.
  onSelect: (agent: TuiAgent, fromCollapsedSection: boolean) => void
  detectedSet: Set<TuiAgent>
  isDetecting: boolean
  yoloPermissions?: boolean
  onYoloPermissionsChange?: (enabled: boolean) => void
  isEmbedded?: boolean
}

function useAgentGridScrollMaxHeight(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  remeasureKey: string,
  enabled: boolean
): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    if (!enabled) {
      return
    }
    const scroll = scrollRef.current
    if (!scroll) {
      return
    }

    const measure = (): void => {
      const card = scroll.querySelector<HTMLElement>('[data-agent-card]')
      const grid = card?.closest<HTMLElement>('[data-agent-grid]')
      if (!card || !grid) {
        setMaxHeight(undefined)
        return
      }
      const gap = Number.parseFloat(getComputedStyle(grid).rowGap || '10')
      const cardHeight = card.getBoundingClientRect().height
      setMaxHeight(Math.ceil(AGENT_GRID_MAX_ROWS * cardHeight + (AGENT_GRID_MAX_ROWS - 1) * gap))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroll)
    const card = scroll.querySelector<HTMLElement>('[data-agent-card]')
    if (card) {
      observer.observe(card)
    }
    return () => observer.disconnect()
  }, [enabled, remeasureKey, scrollRef])

  return maxHeight
}

export function AgentStep({
  selectedAgent,
  onSelect,
  detectedSet,
  isDetecting,
  yoloPermissions = true,
  onYoloPermissionsChange,
  isEmbedded = false
}: AgentStepProps) {
  const agentCatalog = getAgentCatalog()
  const detected = agentCatalog.filter((agent) => detectedSet.has(agent.id))
  const rest = agentCatalog.filter((agent) => !detectedSet.has(agent.id))
  const hasDetected = detected.length > 0
  const primary = hasDetected ? detected : agentCatalog.slice(0, 6)
  const fallbackRest = hasDetected ? rest : agentCatalog.slice(6)
  const selectedEntry =
    selectedAgent && !detectedSet.has(selectedAgent)
      ? agentCatalog.find((a) => a.id === selectedAgent)
      : undefined
  // Why: keep the collapsed bucket open when the selected agent lives there, so
  // the active card is visible without forcing the user to expand the disclosure.
  const selectedEntryIsCollapsed =
    selectedAgent != null && fallbackRest.some((a) => a.id === selectedAgent)
  // Why: one-way latch: auto-open when selection lands in the fallback bucket,
  // but never force-close. The user can freely toggle via the native <details>
  // disclosure once it's open; controlling `open` directly off the prop would
  // slam it shut as soon as `selectedEntryIsCollapsed` flips back to false.
  const [openState, setOpenState] = useState(selectedEntryIsCollapsed)
  const [previousSelectedEntryIsCollapsed, setPreviousSelectedEntryIsCollapsed] =
    useState(selectedEntryIsCollapsed)
  if (selectedEntryIsCollapsed !== previousSelectedEntryIsCollapsed) {
    setPreviousSelectedEntryIsCollapsed(selectedEntryIsCollapsed)
    if (selectedEntryIsCollapsed && !openState) {
      setOpenState(true)
    }
  }
  const fallbackRestLabel = openState
    ? translate('auto.components.onboarding.AgentStep.hideAgents', 'Hide agents')
    : translate(
        'auto.components.onboarding.AgentStep.showMoreAgents',
        'Show {{value0}} more agents→',
        {
          value0: fallbackRest.length
        }
      )
  const agentGridScrollRef = useRef<HTMLDivElement>(null)
  const agentGridScrollMaxHeight = useAgentGridScrollMaxHeight(
    agentGridScrollRef,
    `${primary.length}:${fallbackRest.length}:${openState}:${hasDetected}`,
    !isEmbedded
  )

  return (
    <div className={cn(isEmbedded ? 'flex flex-col gap-5' : 'flex min-h-0 flex-1 flex-col gap-5')}>
      {!hasDetected && !isDetecting && (
        <div className="shrink-0 border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-200/90">
          {translate(
            'auto.components.onboarding.AgentStep.1eee1c7bd8',
            'No agents detected on your PATH. Pick one to install later, or continue with a blank terminal.'
          )}
        </div>
      )}
      {selectedEntry && (
        <div className="flex shrink-0 items-center justify-between gap-3 border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-200/90">
          <span>
            <span className="font-medium">{selectedEntry.label}</span>{' '}
            {translate(
              'auto.components.onboarding.AgentStep.69af7e9c1c',
              "isn't on your PATH yet. Yiru will set it as your default and you can install it any time."
            )}
          </span>
          <Button
            variant="outline"
            size="xs"
            type="button"
            className="h-auto border-amber-400/40 bg-amber-400/10 py-1 text-amber-800 hover:bg-amber-400/20 focus-visible:bg-amber-400/20 dark:text-amber-100"
            onClick={(event) => openHttpLink(selectedEntry.homepageUrl, { event })}
          >
            {translate('auto.components.onboarding.AgentStep.9c163bb0e0', 'Install instructions')}
            <ExternalLink className="size-3" />
          </Button>
        </div>
      )}
      <section
        className={cn(
          isEmbedded ? 'flex flex-col gap-3' : 'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden'
        )}
      >
        <SectionHeader
          label={
            hasDetected
              ? translate(
                  'auto.components.onboarding.AgentStep.d7b3ef168b',
                  'Detected on your system'
                )
              : translate('auto.components.onboarding.AgentStep.e6a369bd04', 'Popular agents')
          }
          count={primary.length}
          showDetectedIndicator={hasDetected}
        />
        <div
          ref={agentGridScrollRef}
          data-agent-grid-scroll
          className={cn(
            isEmbedded ? 'pr-1' : 'scrollbar-sleek min-h-0 flex-1 overflow-y-auto pr-1'
          )}
          style={
            !isEmbedded && agentGridScrollMaxHeight
              ? { maxHeight: agentGridScrollMaxHeight }
              : undefined
          }
        >
          <div className="space-y-3">
            <div data-agent-grid className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
              {primary.map((agent) => (
                <AgentButton
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgent === agent.id}
                  onClick={() => onSelect(agent.id, false)}
                />
              ))}
            </div>
            {fallbackRest.length > 0 && (
              <Collapsible open={openState} onOpenChange={setOpenState}>
                <CollapsibleTrigger className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium transition-colors outline-none data-[state=open]:mb-3">
                  {fallbackRestLabel}
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-[collapsible-up_180ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out]">
                  <div data-agent-grid className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
                    {fallbackRest.map((agent) => (
                      <AgentButton
                        key={agent.id}
                        agent={agent}
                        selected={selectedAgent === agent.id}
                        onClick={() => onSelect(agent.id, true)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>
      </section>
      <YoloPermissionsControl
        yoloPermissions={yoloPermissions}
        onYoloPermissionsChange={onYoloPermissionsChange}
      />
    </div>
  )
}

function YoloPermissionsControl({
  yoloPermissions,
  onYoloPermissionsChange
}: {
  yoloPermissions: boolean
  onYoloPermissionsChange?: (enabled: boolean) => void
}): React.JSX.Element {
  return (
    <label className="border-border bg-muted/25 hover:bg-muted/40 mt-auto flex shrink-0 cursor-pointer items-center justify-between gap-4 border px-4 py-3 transition-colors">
      <span className="flex min-w-0 items-center gap-3">
        <Checkbox
          checked={yoloPermissions}
          onCheckedChange={(checked) => onYoloPermissionsChange?.(checked === true)}
          className="border-border bg-card data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
          aria-label={translate(
            'auto.components.onboarding.AgentStep.yoloPermissionsLabel',
            'Yolo / Dangerously skip permissions'
          )}
        />
        <span className="text-foreground min-w-0 text-sm font-medium">
          {translate(
            'auto.components.onboarding.AgentStep.yoloPermissionsLabel',
            'Yolo / Dangerously skip permissions'
          )}
        </span>
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="quiet"
              size="icon-xs"
              type="button"
              aria-label={translate(
                'auto.components.onboarding.AgentStep.yoloPermissionsInfo',
                'Agent permission info'
              )}
              onPointerDown={(event) => event.preventDefault()}
              className="hover:bg-muted grid place-items-center"
            >
              <Info className="size-3.5" />
            </Button>
          }
        />
        <TooltipContent side="top" sideOffset={6} style={{ zIndex: 120 }}>
          {translate(
            'auto.components.onboarding.AgentStep.yoloPermissionsTooltip',
            'Skip permission checks for agents for less interruptions'
          )}
        </TooltipContent>
      </Tooltip>
    </label>
  )
}

function SectionHeader({
  label,
  count,
  showDetectedIndicator = false
}: {
  label: string
  count: number
  showDetectedIndicator?: boolean
}) {
  return (
    <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-[11px] font-medium tracking-[0.14em] uppercase">
      {showDetectedIndicator && (
        <span className="size-1.5 shrink-0 bg-emerald-500" aria-hidden="true" />
      )}
      <span>{label}</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </div>
  )
}

function AgentButton({
  agent,
  selected,
  onClick
}: {
  agent: AgentCatalogEntry
  selected: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="choice-card"
      size="choice-row"
      type="button"
      data-agent-card
      aria-pressed={selected}
      className="relative overflow-hidden"
      onClick={onClick}
    >
      {selected ? (
        <div className="bg-primary text-primary-foreground absolute top-2 right-2 grid size-5 place-items-center">
          <Check className="size-3" />
        </div>
      ) : null}
      <div className="flex min-w-0 items-start gap-2.5 pr-6">
        <span className="bg-muted text-foreground grid size-7 shrink-0 place-items-center">
          <AgentIcon agent={agent.id} size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-foreground truncate text-sm font-medium">{agent.label}</div>
          <div className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
            {agent.cmd}
          </div>
        </div>
      </div>
    </Button>
  )
}
