import type { AgentPhase } from '@yiru/protocol/agent/phase'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import { translate } from '~renderer/i18n/i18n'
import { tabHasLivePty } from '~renderer/tab-bar/has-live-pty'

export type WorktreeStatus = 'active' | 'inactive' | AgentPhase

const STATUS_LABEL_KEYS: Record<WorktreeStatus, { fallback: string; key: string }> = {
  active: { fallback: 'Active', key: 'agent.status.active' },
  complete: { fallback: 'Complete', key: 'extension.agent.phase.complete' },
  executing: { fallback: 'Executing', key: 'extension.agent.phase.executing' },
  inactive: { fallback: 'Inactive', key: 'agent.status.inactive' },
  thinking: { fallback: 'Thinking', key: 'extension.agent.phase.thinking' },
  'waiting-decision': {
    fallback: 'Waiting for you',
    key: 'extension.agent.phase.waitingDecision'
  }
}

export function getWorktreeStatus(
  tabs: readonly Pick<TerminalTab, 'id'>[],
  browserTabs: readonly { id: string }[],
  ptyIdsByTabId: Record<string, string[]>
): WorktreeStatus {
  const hasLiveTerminal = tabs.some((tab) => tabHasLivePty(ptyIdsByTabId, tab.id))
  return hasLiveTerminal || browserTabs.length > 0 ? 'active' : 'inactive'
}

export function getWorktreeStatusLabel(status: WorktreeStatus): string {
  const label = STATUS_LABEL_KEYS[status]
  return translate(label.key, label.fallback)
}

export function resolveWorktreeStatus(args: {
  agentPhase: AgentPhase | null
  browserTabs: readonly { id: string }[]
  hasRetainedComplete: boolean
  ptyIdsByTabId: Record<string, string[]>
  tabs: readonly Pick<TerminalTab, 'id'>[]
}): WorktreeStatus {
  if (args.agentPhase) {
    return args.agentPhase
  }
  if (args.hasRetainedComplete) {
    return 'complete'
  }
  return getWorktreeStatus(args.tabs, args.browserTabs, args.ptyIdsByTabId)
}
