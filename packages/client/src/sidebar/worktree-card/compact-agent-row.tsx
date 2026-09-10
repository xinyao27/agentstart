import React from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { getAgentRowPrimaryText } from '~renderer/agent/row-primary-text'
import { agentTypeToIconAgent } from '~renderer/agent/status'
import { AgentStateDot, agentStateLabel } from '~renderer/agent/status-dot'
import { formatAgentTypeLabel } from '~renderer/agent/title/type-label'
import { useAgentRowConversationName } from '~renderer/dashboard/use-agent-row-conversation-name'
import type { DashboardAgentRow as DashboardAgentRowData } from '~renderer/dashboard/use-dashboard-data'
import { translate } from '~renderer/i18n/i18n'
import { CaretRight as ChevronRight, X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import CacheTimer, { usePromptCacheCountdownForPane } from '../cache-timer'
import { getAgentDotState } from './agent-summary'

function formatShortTimeAgo(ts: number, now: number): string {
  const delta = now - ts
  if (delta < 60_000) {
    return 'now'
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
}

function lastEnteredDoneAt(agent: DashboardAgentRowData): number | null {
  // Why: idle subagent child rows are alive-but-idle (teammates persist
  // between turns), not finished — fall through to the started-at timestamp.
  if (agent.rowSource === 'subagent' && agent.state === 'idle') {
    return null
  }
  const entry = agent.entry
  if (entry.state === 'done') {
    return entry.stateStartedAt
  }
  for (let i = (entry.stateHistory?.length ?? 0) - 1; i >= 0; i--) {
    if (entry.stateHistory[i].state === 'done') {
      return entry.stateHistory[i].startedAt
    }
  }
  return null
}

function getCompactAgentPrimary(
  agent: DashboardAgentRowData,
  conversationName: string | null
): string {
  const prompt = conversationName ?? getAgentRowPrimaryText(agent.entry)
  return prompt || agentStateLabel(getAgentDotState(agent))
}

function getCompactAgentSecondary(agent: DashboardAgentRowData): string {
  if (agent.entry.interrupted === true) {
    return 'Interrupted by user'
  }
  if (agent.state === 'working') {
    const toolName = agent.entry.toolName?.trim() ?? ''
    const toolInput = agent.entry.toolInput?.trim() ?? ''
    if (toolName && toolInput) {
      return `${toolName}: ${toolInput}`
    }
    if (toolName) {
      return toolName
    }
  }
  const lastAssistantMessage = agent.entry.lastAssistantMessage?.trim()
  if (lastAssistantMessage) {
    return lastAssistantMessage
  }
  // Why: child rows without descriptions use their role as primary text; repeating it adds no information.
  if (agent.rowSource === 'subagent' && agent.entry.prompt?.trim() === agent.agentType.trim()) {
    return ''
  }
  return formatAgentTypeLabel(agent.agentType)
}

function getCompactAgentTime(agent: DashboardAgentRowData, now: number): string | null {
  const doneAt = lastEnteredDoneAt(agent)
  if (doneAt !== null) {
    return formatShortTimeAgo(doneAt, now)
  }
  const startedAt = agent.startedAt > 0 ? agent.startedAt : agent.entry.stateStartedAt
  return startedAt > 0 ? formatShortTimeAgo(startedAt, now) : null
}

type CompactAgentRowProps = {
  agent: DashboardAgentRowData
  now: number
  onActivate: (tabId: string, paneKey: string) => void
  // Why: send-popover target mode temporarily turns compact sidebar rows into
  // the picker surface, matching the full DashboardAgentRow behavior.
  sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
  sendTargetDisabledReason?: string
  onSendTargetClick?: (paneKey: string) => void
  isFocusedPane?: boolean
  childAgentCount?: number
  childAgentsExpanded?: boolean
  onToggleChildAgents?: (paneKey: string) => void
  /** Omitted for synthesized rows (subagent children, title-derived panes),
   *  which have no store entry of their own to dismiss — offering the X would
   *  be a silent no-op. See isDismissibleAgentRow. */
  onDismiss?: (paneKey: string) => void
}

export const CompactAgentRow = function CompactAgentRow({
  agent,
  now,
  onActivate,
  sendTargetStatus,
  sendTargetDisabledReason,
  onSendTargetClick,
  isFocusedPane = false,
  childAgentCount,
  childAgentsExpanded = false,
  onToggleChildAgents,
  onDismiss
}: CompactAgentRowProps) {
  // Why: subagent child rows carry the child's NAME (e.g. "pr-reviewer") in
  // agentType, which is not an iconable agent and would render the unknown
  // "?" glyph. Nesting under the parent already conveys identity.
  const hideIcon = agent.rowSource === 'subagent'
  const dotState = getAgentDotState(agent)
  const conversationName = useAgentRowConversationName(agent)
  const primary = getCompactAgentPrimary(agent, conversationName)
  const secondary = getCompactAgentSecondary(agent)
  const model = agent.entry.model?.trim() ?? ''
  const shortTime = getCompactAgentTime(agent, now)
  const cacheTimer = usePromptCacheCountdownForPane(agent.paneKey)
  const hasChildDisclosure =
    typeof childAgentCount === 'number' &&
    childAgentCount > 0 &&
    typeof onToggleChildAgents === 'function'
  const childDisclosureLabel = hasChildDisclosure
    ? translate(
        'auto.components.right.sidebar.AiVaultSessionSubagents.subagentsCount',
        'Subagents ({{value0}})',
        { value0: childAgentCount }
      )
    : ''

  const handleActivate = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Why: subagent child rows have no pane of their own; they focus the
    // parent pane whose session spawned them.
    onActivate(agent.tab.id, agent.activationPaneKey ?? agent.paneKey)
  }
  const handleSendTargetClickCapture = (e: React.MouseEvent) => {
    if (!sendTargetStatus) {
      return
    }
    const target = e.target
    if (
      target instanceof Element &&
      target.closest('button, a, input, textarea, select, [role="button"]')
    ) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (sendTargetStatus === 'eligible') {
      onSendTargetClick?.(agent.paneKey)
    }
  }
  const handleToggleChildAgents = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    onToggleChildAgents?.(agent.paneKey)
  }
  const handleDismiss = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    onDismiss?.(agent.paneKey)
  }
  // Why: the send picker owns the whole row while it is active, so the X must
  // not compete with it for the trailing slot.
  const canDismiss = typeof onDismiss === 'function' && !sendTargetStatus
  const rowBody = (
    <>
      {!hideIcon && (
        <span className="inline-flex shrink-0" title={formatAgentTypeLabel(agent.agentType)}>
          <AgentIcon agent={agentTypeToIconAgent(agent.agentType)} size={13} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {/* Why: the selected-row fill is strong enough to wash out the dimmed
            prompt/secondary text, so lift both toward full foreground when focused. */}
        <span
          className={
            isFocusedPane
              ? 'text-foreground'
              : 'text-muted-foreground/90 group-hover/agent-row:text-foreground'
          }
        >
          {primary}
        </span>
        {secondary && (
          <span
            className={
              isFocusedPane
                ? 'text-foreground/70'
                : 'text-muted-foreground/65 group-hover/agent-row:text-foreground/75'
            }
          >
            {' '}
            - {secondary}
          </span>
        )}
      </span>
      {model && (
        <span
          className={cn(
            'max-w-24 shrink-0 truncate font-mono text-[10px]',
            isFocusedPane
              ? 'text-foreground/70'
              : 'text-muted-foreground/70 group-hover/agent-row:text-foreground/75'
          )}
          title={model}
        >
          {model}
        </span>
      )}
      {cacheTimer && <CacheTimer startedAt={cacheTimer.startedAt} ttlMs={cacheTimer.ttlMs} />}
      {/* Why: timestamp and dismiss-X share one slot so the row keeps its
          compact width — the same trade the dashboard row makes. On no-hover
          devices the X is always visible, so the timestamp yields there. */}
      {(shortTime || canDismiss) && (
        <span className="relative grid shrink-0 grid-cols-1 grid-rows-1 items-center justify-items-end">
          {shortTime && (
            <span
              className={cn(
                '[grid-area:1/1] text-[10px] tabular-nums',
                // Why: the muted timestamp drops out against the selected-row fill.
                isFocusedPane
                  ? 'text-foreground/70'
                  : 'text-muted-foreground/60 group-hover/agent-row:text-foreground/75',
                canDismiss &&
                  'transition-opacity duration-150 group-hover/agent-row:opacity-0 [@media(hover:none)]:opacity-0'
              )}
            >
              {shortTime}
            </span>
          )}
          {canDismiss && (
            <Button
              variant="quiet"
              size="icon-xs"
              type="button"
              onClick={handleDismiss}
              className={cn(
                '[grid-area:1/1] size-3.5 border-0 p-0',
                'can-hover:opacity-0 transition-opacity duration-150',
                'group-hover/agent-row:opacity-100 focus-visible:opacity-100'
              )}
              aria-label={translate(
                'auto.components.dashboard.DashboardAgentRow.b06e13fcf7',
                'Dismiss agent'
              )}
              title={translate('auto.components.dashboard.DashboardAgentRow.5ae84475cc', 'Dismiss')}
            >
              <X className="size-3" />
            </Button>
          )}
        </span>
      )}
      <AgentStateDot state={dotState} size="sm" />
      {hasChildDisclosure ? (
        <>
          {/* Why: the count remains part of row activation; only the trailing
              chevron owns disclosure, unlike the dashboard's leading control. */}
          <span className="text-[10px] tabular-nums" aria-hidden="true">
            {childAgentCount}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="quiet"
                  size="icon-xs"
                  type="button"
                  onClick={handleToggleChildAgents}
                  aria-label={childDisclosureLabel}
                  aria-expanded={childAgentsExpanded}
                >
                  <ChevronRight
                    className={cn(
                      'size-3 transition-transform duration-150 motion-reduce:transition-none',
                      childAgentsExpanded && 'rotate-90'
                    )}
                  />
                </Button>
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {childDisclosureLabel}
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </>
  )

  return (
    <div
      draggable={false}
      className={cn(
        'group/agent-row min-w-0 cursor-pointer px-1 text-[11px] leading-none rounded-sm',
        'text-muted-foreground',
        // Why: agent rows sit inside an already-filled workspace card, so hover
        // lifts the row's text instead of stacking a second surface on top.
        isFocusedPane && 'bg-accent text-accent-foreground',
        'flex h-6 items-center gap-1',
        sendTargetStatus === 'sending' && 'cursor-progress opacity-75',
        sendTargetStatus === 'disabled' && 'cursor-default opacity-60'
      )}
      onClickCapture={handleSendTargetClickCapture}
      onClick={handleActivate}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.stopPropagation()}
      data-focused-agent-pane={isFocusedPane ? 'true' : undefined}
      data-agent-send-target={sendTargetStatus}
      role={agent.lineage ? 'treeitem' : undefined}
      aria-level={agent.lineage ? agent.lineage.depth + 1 : undefined}
      title={sendTargetDisabledReason ?? `${primary}${secondary ? ` - ${secondary}` : ''}`}
    >
      {rowBody}
    </div>
  )
}
