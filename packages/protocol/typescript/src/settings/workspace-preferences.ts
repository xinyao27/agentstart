import type { AgentActivityDisplayMode } from './ui-state.js'
export type SetupScriptLaunchMode = 'split-vertical' | 'split-horizontal' | 'new-tab'

export type SetupSplitDirection = 'vertical' | 'horizontal'

export type SourceControlViewMode = 'list' | 'tree'

export type LeftSidebarAppearanceMode = 'default' | 'match-terminal' | 'tinted'

export type HostSettingOverrides = {
  displayLabel?: string
  defaultWorktreeLocation?: string
}

export const DEFAULT_SHOW_SLEEPING_WORKSPACES = true
export const DEFAULT_HIDE_SLEEPING_WORKSPACES = false
export const DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE: AgentActivityDisplayMode = 'compact'
export function normalizeAgentActivityDisplayMode(value: unknown): AgentActivityDisplayMode {
  return value === 'full' || value === 'compact' ? value : DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE
}
