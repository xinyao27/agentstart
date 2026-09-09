import type { RepoHookSettingsValue } from '../repo-types.js'

export type SetupRunPolicy = NonNullable<RepoHookSettingsValue['setupRunPolicy']>
export type SetupAgentStartupPolicy = NonNullable<RepoHookSettingsValue['setupAgentStartupPolicy']>
export type HookCommandSourcePolicy = NonNullable<RepoHookSettingsValue['commandSourcePolicy']>
export type SetupDecision = 'inherit' | 'run' | 'skip'

export type PersistedTrustedYiruHookEntry = {
  contentHash: string
  approvedAt: number
}

export type PersistedTrustedYiruHookRepo = {
  all?: {
    approvedAt: number
  }
  setup?: PersistedTrustedYiruHookEntry
  archive?: PersistedTrustedYiruHookEntry
}

export type PersistedTrustedYiruHooks = Record<string, PersistedTrustedYiruHookRepo>

export function getDefaultRepoHookSettings(): RepoHookSettingsValue {
  return {
    mode: 'auto',
    setupRunPolicy: 'run-by-default',
    setupAgentStartupPolicy: 'start-immediately',
    scripts: { setup: '', archive: '' }
  }
}

export type YiruHooks = {
  scripts: {
    setup?: string
    archive?: string
  }
  defaultTabs?: YiruDefaultTabTemplate[]
  worktree?: {
    sharedDirectories: string[]
  }
}

export type YiruDefaultTabTemplate = {
  title?: string
  color?: string
  command?: string
}
