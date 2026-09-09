import { agentPhaseFromStatus } from '@yiru/protocol/agent/phase'
import React, { useState } from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { getAgentRowPrimaryText } from '~renderer/agent/row-primary-text'
import { agentTypeToIconAgent } from '~renderer/agent/status'
import { AgentStateDot, agentStateLabel, type AgentDotState } from '~renderer/agent/status-dot'
import { formatAgentTypeLabel } from '~renderer/agent/title/type-label'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { DashboardAgentChildDisclosure } from './agent-child-disclosure'
import { isDismissibleAgentRow } from './agent-row-dismissible'
import { DashboardAgentRowMessage } from './agent-row-message'
import { DashboardAgentRowToolStep } from './agent-row-tool-step'
import { DashboardAgentRowTrailingControls } from './agent-row-trailing-controls'
import { useAgentRowConversationName } from './use-agent-row-conversation-name'
import type { DashboardAgentRow as DashboardAgentRowData } from './use-dashboard-data'

// Why: the dashboard tracks its own rollup states (incl. 'idle'); narrow to the
// shared dot states for rendering, falling back to 'idle' for any unknown
// value so an unexpected state never crashes a row.
function asDotState(agent: DashboardAgentRowData): AgentDotState {
  if (agent.state === 'idle') {
    return 'idle'
  }
  return agentPhaseFromStatus({ state: agent.state, toolName: agent.entry.toolName })
}

function formatTimeAgo(ts: number, now: number): string {
  const delta = now - ts
  if (delta < 60_000) {
    return 'just now'
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Why: surface the moment the agent most recently transitioned *into* done.
// When the current live state is done, use `stateStartedAt` (not `updatedAt`)
// — `updatedAt` is refreshed on within-state pings (tool/prompt) and would
// drift away from the true transition moment. For past dones, stateHistory
// entries already store the per-transition `startedAt` so we read it directly.
function lastEnteredDoneAt(agent: DashboardAgentRowData): number | null {
  // Why: idle subagent child rows are alive-but-idle (teammates persist
  // between turns) — reading their synthetic entry as "done Xm ago" would
  // mislabel a live teammate as finished.
  if (agent.rowSource === 'subagent' && agent.state === 'idle') {
    return null
  }
  const entry = agent.entry
  if (entry.state === 'done') {
    return entry.stateStartedAt
  }
  for (let i = entry.stateHistory.length - 1; i >= 0; i--) {
    if (entry.stateHistory[i].state === 'done') {
      return entry.stateHistory[i].startedAt
    }
  }
  return null
}

function stateDotTooltipLabel(agent: DashboardAgentRowData, dotState: AgentDotState): string {
  if (agent.entry.interrupted === true) {
    return 'Interrupted by user'
  }
  return agentStateLabel(dotState)
}

type Props = {
  agent: DashboardAgentRowData
  onDismiss: (paneKey: string) => void
  /** Navigate directly to the tab this agent lives in. paneKey is passed
   *  through so the caller can acknowledge (mark-visited) the specific row
   *  that was clicked, without having to re-derive it from the tab id. */
  onActivate: (tabId: string, paneKey: string) => void
  /**
   * Why: the relative-time labels ("Xm ago") need a periodic re-render to stay
   * honest. We accept `now` from a parent container so a single 30s tick owned
   * by the container drives every visible row, rather than each row running
   * its own setInterval. See use-now.ts for the shared hook — WorktreeCardAgents
   * owns the tick for the inline-in-card list.
   */
  now: number
  /**
   * Why: bold weight for the prompt rides on the enclosing workspace card's
   * unvisited signal, not on the per-agent state. Passed in from
   * WorktreeCardAgents so the workspace name and its agent rows share
   * the same "you haven't looked at this yet" rule — visiting the worktree
   * clears the signal, and the next render mutes both in lockstep.
   *
   * Optional so other callers can opt out and default to muted when their
   * surface carries the unread signal elsewhere.
   */
  isUnvisited?: boolean
  /**
   * Why: the inline-in-card variant sits in a tighter layout next to the
   * agent identity icon, so 'md' reads as a second ~12px glyph that users
   * can confuse with the agent icon. 'sm' keeps them visually distinct.
   * The full dashboard has more breathing room and prefers 'md' for leading-
   * slot presence, so default stays 'md'.
   */
  stateDotSize?: 'sm' | 'md'
  /**
   * Why: the inline-in-card variant lives next to a worktree card that the
   * user clicks to jump directly to the agent — a separate expand chevron
   * and a second identity glyph (Claude/Gemini/…) are redundant noise in
   * that tighter layout. The full dashboard keeps both, so these flags
   * default to showing them.
   */
  hideIdentityIcon?: boolean
  hideExpand?: boolean
  /** Reuse the row's hover tint to show the focused terminal pane's agent. */
  isFocusedPane?: boolean
  // Why: inline-card orchestration rows fold children under a leading chevron.
  childAgentCount?: number
  childAgentsExpanded?: boolean
  // Why: taking the pane key as an argument lets the parent share one handler
  // across agent rows while status updates stream in.
  onToggleChildAgents?: (paneKey: string) => void
  childAgentsToggleKey?: string
  // Why: leaf siblings reserve the chevron gutter so state dots align.
  reserveDisclosureGutter?: boolean
  // Why: chevron indentation replaces fixed-offset lineage connector art.
  hideLineageConnectors?: boolean
  // Why: send-popover target mode temporarily turns sidebar rows into the
  // picker surface, so row clicks must send/no-op instead of navigating.
  sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
  sendTargetDisabledReason?: string
  onSendTargetClick?: (paneKey: string) => void
}

const DashboardAgentRow = function DashboardAgentRow({
  agent,
  onDismiss,
  onActivate,
  now,
  isUnvisited = false,
  stateDotSize = 'md',
  hideIdentityIcon = false,
  hideExpand = false,
  isFocusedPane = false,
  childAgentCount,
  childAgentsExpanded = false,
  onToggleChildAgents,
  childAgentsToggleKey,
  reserveDisclosureGutter = false,
  hideLineageConnectors = false,
  sendTargetStatus,
  sendTargetDisabledReason,
  onSendTargetClick
}: Props) {
  const hasChildDisclosure =
    typeof childAgentCount === 'number' &&
    childAgentCount > 0 &&
    typeof onToggleChildAgents === 'function'
  const [expanded, setExpanded] = useState(false)
  const handleToggleExpanded = () => {
    setExpanded((prev) => !prev)
  }
  const handleToggleChildAgents = () => {
    if (childAgentsToggleKey === undefined) {
      return
    }
    onToggleChildAgents?.(childAgentsToggleKey)
  }
  // Why: agent rows navigate directly to the agent's own tab, while the
  // surrounding worktree card navigates to whatever tab the worktree last had
  // focused. Stop propagation so the card click handler does not run second
  // and override our tab activation.
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
  const startedAt = agent.startedAt > 0 ? agent.startedAt : null
  const doneAt = lastEnteredDoneAt(agent)
  const conversationName = useAgentRowConversationName(agent)
  const prompt = conversationName ?? getAgentRowPrimaryText(agent.entry)
  // Why: `agent.entry.prompt` is normalized to '' when the prompt is unknown
  // (fresh agent, missing telemetry). Rendering the row with an empty primary
  // slot would collapse the text column and leave the row with no human-
  // readable label — just a state dot and icon. Fall back to the state label
  // ("Working", "Done", "Waiting", …) so every row is identifiable at a
  // glance.
  const displayLabel = prompt || agentStateLabel(asDotState(agent))
  const model = agent.entry.model?.trim() ?? ''
  // Why: the tool row describes what the agent is *currently* doing; once it
  // leaves working, that line goes stale and misleads (a done row showing
  // "Bash: pnpm test" reads as if the command is still running). Gate tool
  // fields on `state === 'working'`. The assistant message is the opposite
  // — it's the reply, most useful on `done`, so we always show it.
  const isWorking = agent.state === 'working'
  const toolName = isWorking ? (agent.entry.toolName?.trim() ?? '') : ''
  const toolInput = isWorking ? (agent.entry.toolInput?.trim() ?? '') : ''
  const lastAssistantMessage = agent.entry.lastAssistantMessage?.trim() ?? ''
  const isInterrupted = agent.entry.interrupted === true
  const lineage = agent.lineage
  const isLineageChild = lineage?.depth === 1
  const lineageChildCount = lineage?.childCount ?? 0
  const participatesInLineage = isLineageChild || lineageChildCount > 0
  const identityTitle =
    lineageChildCount > 0
      ? `${formatAgentTypeLabel(agent.agentType)} - dispatched ${lineageChildCount} ${
          lineageChildCount === 1 ? 'agent' : 'agents'
        }`
      : [formatAgentTypeLabel(agent.agentType), model].filter(Boolean).join(' · ')
  // Why: interrupted is a terminal outcome the user needs to scan in the
  // leading state column; the secondary-line text below provides the
  // explanation without competing with the prompt or timestamp.
  const dotState: AgentDotState = isInterrupted ? 'interrupted' : asDotState(agent)
  const dotTooltipLabel = stateDotTooltipLabel(agent, dotState)

  // Why: always show the chevron to keep the row's right edge stable — a
  // conditional control would appear/disappear as agent content grows and
  // shrinks mid-turn, which reads as UI flicker. Expanding a row whose
  // content already fits is a no-op; the cost of an occasionally inert
  // toggle is much lower than layout jitter on every live row.

  const startedTimeAgo = startedAt !== null ? formatTimeAgo(startedAt, now) : null
  const doneTimeAgo = doneAt !== null ? formatTimeAgo(doneAt, now) : null
  const relativeTimestamp = doneTimeAgo ?? startedTimeAgo
  const tsParts: string[] = []
  if (startedTimeAgo !== null) {
    tsParts.push(`started ${startedTimeAgo}`)
  }
  if (doneTimeAgo !== null) {
    tsParts.push(`done ${doneTimeAgo}`)
  }

  const titleParts = sendTargetDisabledReason ? [sendTargetDisabledReason, ...tsParts] : tsParts

  return (
    // Why: NOT role="button" / tabIndex={0}. The row contains real <button>
    // children (dismiss X, expand chevron) and tooltip triggers that forward
    // button semantics to their children — nesting them inside an outer
    // role=button violates ARIA's "no interactive content inside interactive
    // content" rule and breaks keyboard/AT navigation. Keyboard users reach
    // the agent via the child buttons and the tab switcher; the outer <div>
    // stays a plain clickable surface for pointer activation.
    <div
      onClickCapture={handleSendTargetClickCapture}
      onClick={handleActivate}
      className={cn(
        // Why: this row owns the timestamp/X hover boundary; anonymous
        // ancestor groups from workspace cards must not reveal every row's X.
        'group/agent-row relative flex flex-col -ml-2 py-1',
        isLineageChild ? 'pl-5 pr-2' : 'px-2',
        'cursor-pointer ',
        isFocusedPane
          ? 'bg-accent text-accent-foreground'
          : isLineageChild
            ? 'bg-[color-mix(in_srgb,var(--sidebar)_74%,var(--background))] dark:bg-[color-mix(in_srgb,var(--accent)_10%,var(--sidebar))]'
            : hasChildDisclosure
              ? 'bg-[color-mix(in_srgb,var(--sidebar-foreground)_3%,var(--sidebar))] dark:bg-[color-mix(in_srgb,var(--accent)_22%,var(--sidebar))]'
              : undefined,
        'hover:bg-accent',
        isLineageChild &&
          "relative before:absolute before:top-1/2 before:left-[0.15rem] before:w-[0.35rem] before:border-t before:border-t-[color:color-mix(in_srgb,var(--sidebar-foreground)_20%,transparent)] before:content-[''] dark:before:border-t-[color:color-mix(in_srgb,var(--accent)_42%,transparent)]",
        sendTargetStatus === 'sending' && 'cursor-progress opacity-75',
        sendTargetStatus === 'disabled' && 'cursor-default opacity-60'
      )}
      data-focused-agent-pane={isFocusedPane ? 'true' : undefined}
      data-agent-send-target={sendTargetStatus}
      title={titleParts.length > 0 ? titleParts.join(' • ') : undefined}
      role={participatesInLineage ? 'treeitem' : undefined}
      aria-level={participatesInLineage ? (lineage?.depth ?? 0) + 1 : undefined}
    >
      {lineageChildCount > 0 && !hideLineageConnectors ? (
        <span
          aria-hidden
          data-agent-lineage-parent-connector
          className="border-muted-foreground/45 dark:border-muted-foreground/35 pointer-events-none absolute top-[1.05rem] bottom-[-0.75rem] left-[13px] border-l-[1.5px]"
        />
      ) : null}
      {isLineageChild && !hideLineageConnectors ? (
        <span
          aria-hidden
          data-agent-lineage-connector={lineage?.isLastSibling === false ? 'branch' : 'last'}
          className="pointer-events-none absolute top-[-1px] bottom-[-1px] left-[13px] w-3"
        >
          <span
            className={cn(
              'absolute left-0 border-l-[1.5px] border-muted-foreground/45 dark:border-muted-foreground/35',
              lineage?.isFirstSibling ? 'top-[-0.9rem]' : 'top-[-1px]',
              lineage?.isLastSibling
                ? lineage?.isFirstSibling
                  ? 'h-[1.6rem]'
                  : 'h-[calc(0.7rem+1px)]'
                : 'bottom-[-1px]'
            )}
          />
          <span className="border-muted-foreground/45 dark:border-muted-foreground/35 absolute top-[0.7rem] left-0 w-1.5 border-t-[1.5px]" />
        </span>
      ) : null}
      <div className="flex items-center gap-1.5">
        <DashboardAgentChildDisclosure
          childAgentCount={childAgentCount}
          childAgentsExpanded={childAgentsExpanded}
          onToggleChildAgents={onToggleChildAgents ? handleToggleChildAgents : undefined}
          reserveDisclosureGutter={reserveDisclosureGutter}
        />
        {/* Why: state indicator lives in the leading gutter so the user's
            eye can sweep one column and know which rows are working,
            waiting, or done at a glance — the common list-view convention (
            notification inboxes and IDE TODO lists). Replaces the earlier left accent
            bar + right-side dot combo, which double-encoded state. Size md
            gives the glyph enough presence for the leading slot without
            overpowering the prompt text. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="inline-flex shrink-0 items-center justify-center"
                aria-label={dotTooltipLabel}
              >
                <AgentStateDot state={dotState} size={stateDotSize} />
              </span>
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            {dotTooltipLabel}
          </TooltipContent>
        </Tooltip>
        {/* Why: identity (Claude/Codex/Gemini/…) sits inline with the prompt
            so the reader gets "state → who → what they said" left-to-right
            on the top row. The sub-rows (tool step, assistant response) are
            about the same agent and do not need the icon repeated next to
            them — keeping the icon only on the prompt row lets the sub-rows
            indent under the prompt text cleanly. Subagent child rows carry
            the child's NAME in agentType (not an iconable agent — it would
            render the unknown "?" glyph), and nesting under the parent
            already conveys identity. */}
        {!hideIdentityIcon && agent.rowSource !== 'subagent' && (
          <span className="inline-flex shrink-0" title={identityTitle}>
            <AgentIcon agent={agentTypeToIconAgent(agent.agentType)} size={14} />
          </span>
        )}
        {/* Why: animate between a 1-line clipped height and the content's
            natural height using Chromium's `interpolate-size: allow-keywords`
            — this is the only way to transition a `height` property to/from
            `auto` without measuring sizes in JS. Falls back to an instant
            swap in engines that don't support it. The inner span keeps
            overflow-hidden so the truncate→wrap class flip stays clipped
            during the interpolation.

            Weight tracks the workspace's unvisited signal (isUnvisited):
            bold + full foreground for agents inside a workspace the user
            hasn't looked at yet, normal + muted once they've visited. This
            keeps the prompt row's weight in lockstep with the workspace
            name above it — one attention axis, not two.

            Rendered unconditionally with a state-label fallback so rows
            without a prompt (fresh/unknown) still have a human-readable
            primary label instead of an empty text column. */}
        <span
          className={cn(
            'block min-w-0 flex-1 overflow-hidden text-[11px] leading-snug',
            'transition-[height] duration-200 ease-out [interpolate-size:allow-keywords]',
            expanded ? 'h-auto whitespace-pre-wrap break-words' : 'h-[1lh] truncate',
            isUnvisited ? 'font-semibold text-foreground' : 'font-normal text-muted-foreground',
            // Why: the selected-row fill washes out muted text — keep it readable.
            isFocusedPane && !isUnvisited && 'text-foreground/90'
          )}
          title={displayLabel}
        >
          {displayLabel}
        </span>
        {model && (
          <span
            className="text-muted-foreground/70 max-w-24 shrink-0 truncate font-mono text-[10px]"
            title={model}
          >
            {model}
          </span>
        )}
        {/* Why: "+N" badge mirrors the leading chevron — without it the
            parent row reads identical to a leaf row when collapsed, and the
            child count is invisible. Hidden when expanded because the
            children are visible directly below. */}
        {hasChildDisclosure && !childAgentsExpanded && (
          <span
            className="text-muted-foreground/70 shrink-0 text-[10px] leading-none font-normal tabular-nums"
            aria-hidden
          >
            +{childAgentCount}
          </span>
        )}
        <DashboardAgentRowTrailingControls
          paneKey={agent.paneKey}
          relativeTimestamp={relativeTimestamp}
          expanded={expanded}
          hideExpand={hideExpand}
          hideDismiss={!isDismissibleAgentRow(agent)}
          sendTargetStatus={sendTargetStatus}
          onDismiss={onDismiss}
          onToggleExpanded={handleToggleExpanded}
          onSendTargetClick={onSendTargetClick}
        />
      </div>
      <DashboardAgentRowToolStep
        expanded={expanded}
        isWorking={isWorking}
        toolName={toolName}
        toolInput={toolInput}
      />
      <DashboardAgentRowMessage
        expanded={expanded}
        isInterrupted={isInterrupted}
        lastAssistantMessage={lastAssistantMessage}
      />
    </div>
  )
}

export default DashboardAgentRow
