import type { SleepingAgentLaunchConfig } from '@agentstart/protocol/agent/session-resume'
import type { TuiAgent } from '@agentstart/protocol/agent/types'

type TerminalLaunch = {
  launchConfig?: SleepingAgentLaunchConfig
  launchToken?: string
  launchAgent?: TuiAgent
  cwd?: string
  activate?: boolean
  presentation?: 'background' | 'visible' | 'focused'
  source?: 'runtime-session'
}

export type TerminalCreateRequest = TerminalLaunch & {
  worktreeId?: string
  afterTabId?: string
  targetGroupId?: string
  command?: string
  env?: Record<string, string>
  envToDelete?: string[]
  startupCommandDelivery?: 'fast' | 'shell-ready'
  title?: string
}
export type TerminalCreateResult = { tabId: string; title: string }

export type TerminalRevealRequest = TerminalLaunch & {
  worktreeId: string
  ptyId: string
  durablePtyId?: string
  title?: string | null
  tabId?: string
  leafId?: string
  splitFromLeafId?: string
  splitDirection?: 'horizontal' | 'vertical'
  splitTelemetrySource?: 'contextual_tour' | 'keyboard' | 'context_menu' | 'command' | 'unknown'
}
export type TerminalRevealResult = { tabId: string; title?: string | null }

export type TerminalMountRequest = { worktreeId: string; tabId?: string; ptyId?: string }
export type TerminalMountResult = { accepted: boolean }
