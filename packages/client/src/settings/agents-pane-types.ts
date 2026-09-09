import type { AgentPermissionMode } from '@yiru/protocol/agent/launch/permissions'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

import type { AgentSessionSourceHomeControl } from './codex-session-source-home-control'

export type AgentsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  wslSupportedPlatform?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
}

export type AgentAvailabilityUpdateQueueOptions = {
  getSettings: () => GlobalSettings | null | undefined
  fallbackSettings: GlobalSettings
  updateSettings: AgentsPaneProps['updateSettings']
  agentId: TuiAgent
  enabled: boolean
}

export type AgentRowProps = {
  agentId: TuiAgent
  label: string
  homepageUrl: string
  defaultCmd: string
  defaultArgs: string
  defaultEnv: Record<string, string>
  isDetected: boolean
  isEnabled: boolean
  isDefault: boolean
  cmdOverride: string | undefined
  argsOverride: string
  envOverride: Record<string, string>
  onSetDefault: () => void
  onSetEnabled: (enabled: boolean) => void
  onSaveOverride: (value: string) => void
  onSaveArgs: (value: string) => void
  onSaveEnv: (value: Record<string, string>) => void
  /** Codex-only: current runtime scope label + persisted history-source override. */
  sessionSourceHome?: AgentSessionSourceHomeControl
}

export type AgentCommandOverrideInputProps = {
  defaultCmd: string
  cmdOverride: string | undefined
  onSaveOverride: (value: string) => void
}

export type AgentDefaultArgsInputProps = {
  defaultArgs: string
  argsOverride: string
  onSaveArgs: (value: string) => void
}

export type AgentDefaultEnvInputProps = {
  defaultEnv: Record<string, string>
  envOverride: Record<string, string>
  onSaveEnv: (value: Record<string, string>) => void
}

export type AgentAvailability = 'enabled' | 'disabled'

export type AgentAvailabilityControlProps = {
  label: string
  isEnabled: boolean
  onSetEnabled: (enabled: boolean) => void
}

export type AgentPermissionsSettingProps = {
  mode: AgentPermissionMode
  onChange: (mode: Exclude<AgentPermissionMode, 'mixed'>) => void
}
