import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import { AgentIcon } from '~renderer/agent/catalog'
import { AgentStateDot, type AgentDotState } from '~renderer/agent/status-dot'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'
import { UnreadStatusIndicator } from '~renderer/ui/unread-status-indicator'

import { ShellIcon } from './shell-icons'
import { TAB_LEADING_ICON_CLASSES } from './tab-chrome-classes'
import type { TerminalTabActivityStatus } from './terminal-tab-activity-status'

type TerminalTabLeadingIconProps = {
  agent: TuiAgent | null
  activityStatus: TerminalTabActivityStatus
  shell: TerminalTab['shellOverride']
  showUnreadActivity: boolean
  isActive: boolean
}

type TerminalTabAgentIdentityIconProps = {
  agent: TuiAgent
  isActive: boolean
  className?: string
}

/**
 * Map the container status to the shared state-dot vocabulary. `active` and
 * `inactive` carry no activity glyph — the tab falls through to its agent or
 * shell identity icon instead. Uses the same WorktreeStatus vocabulary as the
 * sidebar so live states read identically (tabs intentionally omit the card's
 * retained-done promotion, so a stale green check can differ after cleanup).
 */
function activityDotState(status: TerminalTabActivityStatus): AgentDotState | null {
  switch (status) {
    case 'thinking':
    case 'executing':
    case 'waiting-decision':
    case 'complete':
      return status
    case 'active':
    case 'inactive':
      return null
  }
}

/** Keep the provider glyph treatment identical across every terminal-tab state. */
function TerminalTabAgentIdentityIcon({
  agent,
  isActive,
  className
}: TerminalTabAgentIdentityIconProps): React.JSX.Element {
  return (
    <span
      className={cn('inline-flex size-3.5 [&>*]:size-full', !isActive && 'opacity-70', className)}
      data-agent-icon={agent}
      aria-hidden
    >
      <AgentIcon agent={agent} />
    </span>
  )
}

/** Render a terminal tab's current state without hiding its agent or shell identity. */
export function TerminalTabLeadingIcon({
  agent,
  activityStatus,
  shell,
  showUnreadActivity,
  isActive
}: TerminalTabLeadingIconProps): React.JSX.Element {
  if (showUnreadActivity) {
    return (
      <span
        data-testid="tab-activity-bell"
        aria-label={translate(
          'auto.components.tab.bar.TerminalTabLeadingIcon.7ab2964bea',
          'Unread agent completion'
        )}
        className="mr-2 inline-flex shrink-0 items-center gap-1"
      >
        <UnreadStatusIndicator />
        {agent ? <TerminalTabAgentIdentityIcon agent={agent} isActive={isActive} /> : null}
      </span>
    )
  }

  const dotState = activityDotState(activityStatus)
  if (dotState) {
    return (
      <span
        data-testid="tab-agent-activity-indicator"
        data-agent-activity-status={activityStatus}
        className="mr-2 inline-flex shrink-0 items-center gap-1"
      >
        <AgentStateDot state={dotState} size="md" />
        {/* Why: status and identity answer different questions. Keep the agent
            logo beside the state glyph so parallel tabs remain scannable. */}
        {agent ? <TerminalTabAgentIdentityIcon agent={agent} isActive={isActive} /> : null}
      </span>
    )
  }

  if (agent) {
    return (
      <TerminalTabAgentIdentityIcon agent={agent} isActive={isActive} className="mr-2 shrink-0" />
    )
  }

  // Why: ShellIcon renders a colored brand-style tile for PowerShell, CMD,
  // Git Bash, and WSL while retaining the generic terminal fallback elsewhere.
  return (
    <span
      className={cn(
        TAB_LEADING_ICON_CLASSES,
        'inline-flex [&>*]:size-full',
        isActive ? '' : 'opacity-70'
      )}
      data-shell-icon={shell ?? 'generic'}
      aria-hidden
    >
      <ShellIcon shell={shell} />
    </span>
  )
}
