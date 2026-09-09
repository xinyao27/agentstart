import type { SleepingAgentLaunchConfig } from '@yiru/protocol/agent/session-resume'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import { resolveCompatibleAgentTypeForOwner } from '~renderer/agent/title/owner'
import { scheduleRuntimeGraphSync } from '~renderer/runtime/sync-runtime-graph'
import { useAppStore } from '~renderer/store/state'

import type { PaneBinding } from './pane-binding'

type ActivePaneBindingOptions = {
  paneKey: string
  tabId: string
  launchToken: string | null
  launchConfig: SleepingAgentLaunchConfig | null
  initialStatus: { agent: TuiAgent; prompt: string } | null
  paneBinding: PaneBinding
  getAuthoritativeAgent: () => string | undefined
  resolveExpectedLaunchAgent: () => TuiAgent | null
  onInitialAgentStarted: (agent: TuiAgent) => void
  sampleForegroundAgent: () => void
  syncLayoutBinding: (ptyId: string) => void
  updateTabPtyId: (ptyId: string, replacedPtyId?: string) => void
  startProcessTracking: () => void
}

export type ActivePaneBindingOptionsOverride = {
  seedInitialAgentStatus?: boolean
  updateTabPtyId?: 'always' | 'if-missing'
  replacePtyId?: string
  sampleVisibleForegroundAgent?: boolean
}

export function createActivePaneBinding(
  options: ActivePaneBindingOptions
): (ptyId: string, override?: ActivePaneBindingOptionsOverride) => void {
  const applyInitialAgentStatus = (): void => {
    if (!options.initialStatus) {
      return
    }
    const status = {
      state: 'working' as const,
      prompt: options.initialStatus.prompt,
      agentType: resolveCompatibleAgentTypeForOwner(
        options.initialStatus.agent,
        options.getAuthoritativeAgent()
      )
    }
    if (options.launchConfig) {
      useAppStore
        .getState()
        .setAgentStatus(options.paneKey, status, undefined, undefined, undefined, {
          launchConfig: options.launchConfig,
          ...(options.launchToken ? { launchToken: options.launchToken } : {})
        })
    } else {
      useAppStore.getState().setAgentStatus(options.paneKey, status)
    }
  }

  return (ptyId, override = {}) => {
    options.paneBinding.bind(ptyId)
    options.syncLayoutBinding(ptyId)
    const tabPtyIds = useAppStore.getState().ptyIdsByTabId?.[options.tabId] ?? []
    if (override.updateTabPtyId !== 'if-missing' || !tabPtyIds.includes(ptyId)) {
      options.updateTabPtyId(ptyId, override.replacePtyId)
    }
    if (override.seedInitialAgentStatus) {
      applyInitialAgentStatus()
    }
    scheduleRuntimeGraphSync()
    options.startProcessTracking()
    if (override.sampleVisibleForegroundAgent === true) {
      options.sampleForegroundAgent()
    } else if (override.seedInitialAgentStatus === true) {
      const launchAgent = options.resolveExpectedLaunchAgent()
      if (launchAgent) {
        options.onInitialAgentStarted(launchAgent)
      }
    }
  }
}
