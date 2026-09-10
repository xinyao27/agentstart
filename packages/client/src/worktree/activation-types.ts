import type { StartupCommandDelivery } from '@agentstart/protocol/agent/launch/startup-delivery'
import type { SessionOptionValue } from '@agentstart/protocol/agent/session-options/types'
import type {
  AgentProviderSessionMetadata,
  SleepingAgentLaunchConfig
} from '@agentstart/protocol/agent/session-resume'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { SetupSplitDirection } from '@agentstart/protocol/settings/workspace-preferences'
import type {
  WorktreeDefaultTabsLaunch,
  WorktreeSetupLaunch
} from '@agentstart/protocol/worktree/create-result'

import type { AgentStartedTelemetry } from '../agent/started-telemetry'
import type { PendingSidebarWorktreeReveal } from '../application-shell/state/slice'
import type { WorktreeRuntimeOwnerState } from './runtime-owner'

export type WorktreeStartupPayload = {
  command: string
  env?: Record<string, string>
  launchConfig?: SleepingAgentLaunchConfig
  resumeProviderSession?: AgentProviderSessionMetadata
  launchToken?: string
  launchAgent?: TuiAgent
  draftPrompt?: string
  startupCommandDelivery?: StartupCommandDelivery
  initialAgentStatus?: { agent: TuiAgent; prompt: string }
  sessionOptions?: Record<string, SessionOptionValue>
  telemetry?: AgentStartedTelemetry
}

export type ActivateAndRevealResult = { primaryTabId: string | null }

export type ActivateWorktreeOptions = {
  startup?: WorktreeStartupPayload
  initialCwd?: string
  setup?: WorktreeSetupLaunch
  defaultTabs?: WorktreeDefaultTabsLaunch
  sidebarRevealBehavior?: PendingSidebarWorktreeReveal['behavior']
  notifyHostRuntime?: boolean
  revealInSidebar?: boolean
}

export type WorktreeActivationStore = Partial<WorktreeRuntimeOwnerState> & {
  tabsByWorktree: Record<string, { id: string }[]>
  defaultTerminalTabsAppliedByWorktreeId: Record<string, true>
  createTab: (
    worktreeId: string,
    targetGroupId?: string,
    shellOverride?: string,
    options?: {
      pendingActivationSpawn?: boolean
      launchAgent?: TuiAgent
      recordInteraction?: boolean
      activate?: boolean
    }
  ) => { id: string }
  setActiveTab: (tabId: string) => void
  setTabCustomTitle: (
    tabId: string,
    title: string | null,
    options?: { recordInteraction?: boolean }
  ) => void
  setTabColor: (tabId: string, color: string | null) => void
  markDefaultTerminalTabsApplied: (worktreeId: string) => void
  reconcileWorktreeTabModel: (worktreeId: string) => { renderableTabCount: number }
  queueTabStartupCommand: (
    tabId: string,
    startup: {
      command: string
      env?: Record<string, string>
      launchConfig?: SleepingAgentLaunchConfig
      resumeProviderSession?: AgentProviderSessionMetadata
      launchToken?: string
      launchAgent?: TuiAgent
      draftPrompt?: string
      initialAgentStatus?: { agent: TuiAgent; prompt: string }
      showSessionRestoredBanner?: boolean
      telemetry?: AgentStartedTelemetry
    }
  ) => void
  queueTabSetupSplit: (
    tabId: string,
    startup: { command: string; env?: Record<string, string>; direction: SetupSplitDirection }
  ) => void
  queueTabInitialCwd: (tabId: string, cwd: string) => void
  settings?: GlobalSettings | null
}
