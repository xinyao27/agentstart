import type { ParsedAgentStatusPayload } from '@yiru/protocol/agent/status-records'
import {
  normalizeCompatibleAgentTitleForOwner,
  resolveCompatibleAgentTypeForOwner
} from '~renderer/agent/title/owner'
import { useAppStore } from '~renderer/store/state'

import { resolveAgentStatusTerminalTitle } from '../agent/status-terminal-title'
import { shouldSuppressCodexAutoApprovalStatus } from '../codex-auto-approval-notification-suppression'
import type { AgentNotificationController } from './agent-notification-controller'

type AgentStatusOptions = {
  paneKey: string
  paneId: number
  tabId: string
  launchToken: string | null
  getAuthoritativeAgent: () => string | undefined
  notifications: AgentNotificationController
}

export function createAgentStatusHandler(
  options: AgentStatusOptions
): (payload: ParsedAgentStatusPayload) => void {
  return (payload) => {
    if (
      shouldSuppressCodexAutoApprovalStatus(payload, {
        paneKey: options.paneKey,
        tabId: options.tabId,
        ...(options.launchToken ? { launchToken: options.launchToken } : {})
      })
    ) {
      return
    }
    // Why: one store snapshot pairs the status and title atomically from the
    // renderer's perspective; a title update cannot interleave between reads.
    const state = useAppStore.getState()
    const title = state.runtimePaneTitlesByTabId?.[options.tabId]?.[options.paneId]
    const authoritativeAgent = options.getAuthoritativeAgent()
    const agentType = resolveCompatibleAgentTypeForOwner(payload.agentType, authoritativeAgent)
    const statusPayload = agentType === payload.agentType ? payload : { ...payload, agentType }
    const resolvedTitle = resolveAgentStatusTerminalTitle(statusPayload, title)
    const statusTitle = resolvedTitle
      ? normalizeCompatibleAgentTitleForOwner(resolvedTitle, agentType ?? authoritativeAgent)
      : resolvedTitle
    if (options.launchToken) {
      state.setAgentStatus(options.paneKey, statusPayload, statusTitle, undefined, undefined, {
        launchToken: options.launchToken
      })
    } else {
      state.setAgentStatus(options.paneKey, statusPayload, statusTitle)
    }
    const storedStatus = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
    options.notifications.observeHookStatus(
      typeof storedStatus?.stateStartedAt === 'number'
        ? { ...statusPayload, stateStartedAt: storedStatus.stateStartedAt }
        : statusPayload
    )
  }
}
