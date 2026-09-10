import type { RepoHookSettingsValue } from '../repo-types.js'

export type SetupRunPolicy = NonNullable<RepoHookSettingsValue['setupRunPolicy']>
export type SetupAgentStartupPolicy = NonNullable<RepoHookSettingsValue['setupAgentStartupPolicy']>
export type HookCommandSourcePolicy = NonNullable<RepoHookSettingsValue['commandSourcePolicy']>
export type SetupDecision = 'inherit' | 'run' | 'skip'

export type PersistedTrustedAgentStartHookEntry = {
  contentHash: string
  approvedAt: number
}

export type PersistedTrustedAgentStartHookRepo = {
  all?: {
    approvedAt: number
  }
  setup?: PersistedTrustedAgentStartHookEntry
  archive?: PersistedTrustedAgentStartHookEntry
}

export type PersistedTrustedAgentStartHooks = Record<string, PersistedTrustedAgentStartHookRepo>

export function getDefaultRepoHookSettings(): RepoHookSettingsValue {
  return {
    mode: 'auto',
    setupRunPolicy: 'run-by-default',
    setupAgentStartupPolicy: 'start-immediately',
    scripts: { setup: '', archive: '' }
  }
}

export type AgentStartHooks = {
  scripts: {
    setup?: string
    archive?: string
  }
  defaultTabs?: AgentStartDefaultTabTemplate[]
  worktree?: {
    sharedDirectories: string[]
  }
}

export type AgentStartDefaultTabTemplate = {
  title?: string
  color?: string
  command?: string
}
