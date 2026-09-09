import type { AgentType } from '@yiru/protocol/agent/status-records'
import { useAppStore } from '~renderer/store/state'

import { shouldSeedCacheTimerOnInitialTitle } from '../cache-timer-seeding'
import { shouldSuppressCodexAutoApprovalSyntheticTitle } from '../codex-auto-approval-notification-suppression'
import { resolvePaneTitleDecision } from '../terminal-title-evidence'
import type { AgentNotificationController } from './agent-notification-controller'
import type { TitleCompletionSideEffects } from './title-completion-side-effects'

type PaneTitleOptions = {
  paneKey: string
  paneId: number
  tabId: string
  launchToken: string | null
  getDisplayOwner: () => AgentType | undefined
  getRendererOwner: () => AgentType | undefined
  getIsActivePane: () => boolean
  setGpuRendering: (enabled: boolean) => void
  setRuntimeTitle: (title: string) => void
  updateTabTitle: (title: string) => void
  setCacheTimerStartedAt: (timestamp: number) => void
  completionSideEffects: TitleCompletionSideEffects
  notifications: AgentNotificationController
}

export type PaneTitle = {
  onChange: (title: string, rawTitle: string, meta?: { staleWorkingTitleClear?: boolean }) => void
}

export function createPaneTitle(options: PaneTitleOptions): PaneTitle {
  let hasConsideredInitialCacheTimerSeed = false
  return {
    onChange: (title, rawTitle, meta) => {
      const decision = resolvePaneTitleDecision({
        normalizedTitle: title,
        rawTitle,
        displayOwnerAgentType: options.getDisplayOwner(),
        rendererOwnerAgentType: options.getRendererOwner(),
        userGpuMode: useAppStore.getState().settings?.terminalGpuAcceleration ?? 'auto'
      })
      const paneTitle = decision.displayTitle
      if (
        shouldSuppressCodexAutoApprovalSyntheticTitle(paneTitle, {
          paneKey: options.paneKey,
          tabId: options.tabId,
          ...(options.launchToken ? { launchToken: options.launchToken } : {})
        })
      ) {
        return
      }
      options.setGpuRendering(decision.rendererPolicy.gpuEnabled)
      options.setRuntimeTitle(paneTitle)
      if (!meta?.staleWorkingTitleClear) {
        const activeStatus = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
        if (
          !options.completionSideEffects.shouldSuppressForFreshHook(decision.rawTitle, activeStatus)
        ) {
          // Why: display titles update while hooks are active, but a stale idle
          // frame cannot complete a turn before its hook reports done.
          options.notifications.observeTitle(decision.rawTitle)
        }
      }
      // Why: only the focused split owns the tab label; sibling title traffic
      // must not make the shared tab flicker.
      if (options.getIsActivePane()) {
        options.updateTabTitle(paneTitle)
      }
      if (hasConsideredInitialCacheTimerSeed) {
        return
      }
      hasConsideredInitialCacheTimerSeed = true
      const state = useAppStore.getState()
      if (
        shouldSeedCacheTimerOnInitialTitle({
          rawTitle,
          allowInitialIdleSeed: false,
          existingTimerStartedAt: state.cacheTimerByKey[options.paneKey],
          promptCacheTimerEnabled: state.settings?.promptCacheTimerEnabled ?? null
        })
      ) {
        options.setCacheTimerStartedAt(Date.now())
      }
    }
  }
}
