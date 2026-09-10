import type { AgentType } from '@agentstart/protocol/agent/status-records'
import { isClaudeAgent } from '~renderer/agent/title/provider'
import { detectAgentStatusFromTitle } from '~renderer/agent/title/status'
import { useAppStore } from '~renderer/store/state'

import type { AgentNotificationController } from './agent-notification-controller'
import type { TitleCompletionSideEffects } from './title-completion-side-effects'

type AgentTitleLifecycleOptions = {
  paneKey: string
  setCacheTimerStartedAt: (timestamp: number | null) => void
  setFocusReportSuppression: (title: string, agentType: AgentType | undefined) => void
  clearFocusReportSuppression: () => void
  queueIdleTerminalModeReset: () => void
  clearShellInference: () => void
  reconfirmKnownDroid: () => void
  disposeTitleOnlyInterrupt: () => void
  completionSideEffects: TitleCompletionSideEffects
  notifications: AgentNotificationController
}

export type AgentTitleLifecycle = {
  onIdle: (title: string, meta?: { staleWorkingTitleClear?: boolean }) => void
  onWorking: () => void
  onExited: () => void
}

export function createAgentTitleLifecycle(
  options: AgentTitleLifecycleOptions
): AgentTitleLifecycle {
  return {
    onIdle: (title, meta) => {
      // Why: stale-derived idle is a silence timeout, not completion evidence.
      if (meta?.staleWorkingTitleClear) {
        options.setCacheTimerStartedAt(null)
        return
      }
      const state = useAppStore.getState()
      const activeStatus = state.agentStatusByPaneKey[options.paneKey]
      if (options.completionSideEffects.shouldSuppressForFreshHook(title, activeStatus)) {
        if (activeStatus) {
          options.completionSideEffects.preserve(title, activeStatus)
        }
        return
      }
      const settings = state.settings
      if (isClaudeAgent(title) && (settings === null || settings.promptCacheTimerEnabled)) {
        options.setCacheTimerStartedAt(Date.now())
      }
      if (detectAgentStatusFromTitle(title) === 'idle') {
        options.setFocusReportSuppression(title, activeStatus?.agentType)
      }
      options.notifications.observeClassifiedTitleCompletion(title)
      options.queueIdleTerminalModeReset()
    },
    onWorking: () => {
      options.clearFocusReportSuppression()
      options.completionSideEffects.clear()
      options.notifications.observeTitleWorking()
      options.setCacheTimerStartedAt(null)
    },
    onExited: () => {
      options.completionSideEffects.clear()
      options.clearShellInference()
      options.reconfirmKnownDroid()
      options.setCacheTimerStartedAt(null)
      options.disposeTitleOnlyInterrupt()
      // Why: title reversion is not process death; the PTY process tracker
      // remains responsible for removing the authoritative agent row.
    }
  }
}
