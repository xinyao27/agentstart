export type RepoKindValue = 'git' | 'folder'

export type RepoIconValue =
  | { type: 'lucide'; name: string }
  | { type: 'emoji'; emoji: string }
  | {
      type: 'image'
      src: string
      source: 'upload' | 'file' | 'favicon' | 'github'
      label?: string
    }

export type RepoHookSettingsValue = {
  mode: 'auto' | 'override'
  setupRunPolicy?: 'ask' | 'run-by-default' | 'skip-by-default'
  setupAgentStartupPolicy?: 'start-immediately' | 'wait-for-setup'
  commandSourcePolicy?: 'shared-only' | 'local-only' | 'run-both'
  scripts: { setup: string; archive: string }
}

export type RepoAgentValue =
  | 'claude'
  | 'openclaude'
  | 'codex'
  | 'autohand'
  | 'opencode'
  | 'mimo-code'
  | 'pi'
  | 'omp'
  | 'gemini'
  | 'antigravity'
  | 'aider'
  | 'goose'
  | 'amp'
  | 'kilo'
  | 'kiro'
  | 'crush'
  | 'aug'
  | 'cline'
  | 'codebuff'
  | 'command-code'
  | 'continue'
  | 'cursor'
  | 'droid'
  | 'kimi'
  | 'mistral-vibe'
  | 'qwen-code'
  | 'rovo'
  | 'hermes'
  | 'openclaw'
  | 'copilot'
  | 'grok'
  | 'devin'
  | 'ante'
  | 'trae'

export type RepoSourceControlOperation = 'commitMessage' | 'pullRequest' | 'branchName'
export type RepoSourceControlAction =
  | RepoSourceControlOperation
  | 'fixCommitFailure'
  | 'fixPushFailure'
  | 'fixChecks'
  | 'resolveConflicts'
  | 'resolveComments'

export type RepoSourceControlModelChoiceValue = {
  selectedModelByAgent?: Partial<Record<RepoAgentValue, string>>
  selectedModelByAgentByHost?: Partial<Record<string, Partial<Record<RepoAgentValue, string>>>>
  selectedThinkingByModel?: Record<string, string>
}

export type RepoSourceControlAiValue = {
  enabled?: boolean
  customAgentCommand?: string
  modelOverridesByOperation?: Partial<
    Record<RepoSourceControlOperation, RepoSourceControlModelChoiceValue>
  >
  instructionsByOperation?: Partial<Record<RepoSourceControlOperation, string | null>>
  actionOverrides?: Partial<
    Record<
      RepoSourceControlAction,
      {
        agentId?: RepoAgentValue | 'custom' | null
        commandInputTemplate?: string | null
        agentArgs?: string | null
      }
    >
  >
  prCreationDefaults?: {
    draft?: boolean | null
    useTemplate?: boolean | null
    generateDetailsOnOpen?: boolean | null
    openAfterCreate?: boolean | null
  }
}

export type RepoValue = {
  id: string
  path: string
  displayName: string
  badgeColor: string
  repoIcon?: RepoIconValue | null
  upstream?: { owner: string; repo: string } | null
  addedAt: number
  kind?: RepoKindValue
  gitUsername?: string
  worktreeBaseRef?: string
  worktreeBasePath?: string
  hookSettings?: RepoHookSettingsValue
  connectionId?: string | null
  executionHostId?: 'local' | `runtime:${string}` | `ssh:${string}` | `wsl:${string}` | null
  forgeRemotePreference?: 'auto' | 'upstream' | 'origin'
  forkSyncMode?: 'ask' | 'safe-auto' | 'off'
  gitRemoteIdentity?: {
    canonicalKey: string
    remoteName: string
    remoteUrl: string
  } | null
  externalWorktreeVisibility?: 'hide' | 'show'
  externalWorktreeVisibilityLegacy?: boolean
  externalWorktreeVisibilityPromptDismissedAt?: number
  externalWorktreeInboxBaselinePaths?: string[]
  importedExternalWorktreePaths?: string[]
  externalWorktreeDiscoverySuppressedAt?: number
  symlinkPaths?: string[]
  projectGroupId?: string | null
  projectGroupOrder?: number
  sourceControlAi?: RepoSourceControlAiValue
  projectHostSetupMethod?: 'imported-existing-folder' | 'cloned'
}

export type RepoListResult = { repos: RepoValue[]; revision: number }
export type RepoExecutionHostId = 'local' | `runtime:${string}` | `ssh:${string}` | `wsl:${string}`
export type RepoAddInput = {
  expectedRevision?: number
  path: string
  kind?: RepoKindValue
  hostId?: RepoExecutionHostId
}
export type RepoAddResult = { repo: RepoValue; revision: number }
export type RepoCreateInput = {
  expectedRevision: number
  parentPath: string
  name: string
  kind?: RepoKindValue
}
// Why: repo creation reports recoverable validation and filesystem failures as
// an in-band `{ error }` result rather than a thrown RPC error, so the client's
// inline-error UI keeps working unchanged.
export type RepoCreateResult = { repo: RepoValue; revision: number } | { error: string }
export type RepoCloneInput = { expectedRevision: number; url: string; destination: string }
export type RepoSelectorInput = { repo: string }
export type RepoHooksCheckInput = RepoSelectorInput & { hostId?: RepoExecutionHostId }
export type RepoRemoveInput = { expectedRevision: number; repo: string }
export type RepoReorderInput = { expectedRevision: number; orderedIds: string[] }
export type RepoRemoveResult = { removed: boolean; revision: number }
export type RepoReorderResult = { revision: number; status: 'applied' | 'rejected' }
export type RepoUpdateInput = {
  displayName?: string
  badgeColor?: string
  repoIcon?: RepoIconValue | null
  upstream?: { owner: string; repo: string } | null
  hookSettings?: RepoHookSettingsValue
  worktreeBaseRef?: string
  worktreeBasePath?: string
  kind?: RepoKindValue
  symlinkPaths?: string[]
  forgeRemotePreference?: 'auto' | 'upstream' | 'origin'
  forkSyncMode?: 'ask' | 'safe-auto' | 'off'
  externalWorktreeVisibility?: 'hide' | 'show'
  externalWorktreeVisibilityPromptDismissedAt?: number
  externalWorktreeInboxBaselinePaths?: string[]
  importedExternalWorktreePaths?: string[]
  externalWorktreeDiscoverySuppressedAt?: number | null
  projectGroupId?: string | null
  projectGroupOrder?: number
  sourceControlAi?: RepoSourceControlAiValue | null
}
export type RepoSparsePresetValue = {
  id: string
  repoId: string
  name: string
  directories: string[]
  createdAt: number
  updatedAt: number
}
export type RepoSparsePresetsResult = { presets: RepoSparsePresetValue[] }
export type RepoSaveSparsePresetInput = {
  repo: string
  id?: string
  name: string
  directories: string[]
}
export type RepoSparsePresetResult = { preset: RepoSparsePresetValue }
export type RepoYiruHooksValue = {
  scripts: { setup?: string; archive?: string }
  defaultTabs?: { title?: string; color?: string; command?: string }[]
  worktree?: { sharedDirectories: string[] }
}
export type RepoSetupTrustValue = { contentHash: string; scriptContent: string }
export type RepoHooksValue = {
  hasHooksFile: boolean
  hooks: RepoYiruHooksValue | null
  setupRunPolicy: 'ask' | 'run-by-default' | 'skip-by-default'
  source: 'yiru.yaml' | 'legacy' | null
  setupTrust?: RepoSetupTrustValue
}
export type RepoHooksCheckResult = {
  status: 'ok' | 'error'
  hasHooks: boolean
  hooks: RepoYiruHooksValue | null
  mayNeedUpdate: boolean
}
export type RepoSetupImportCandidateValue = {
  provider: string
  label: string
  files: string[]
  setup: string
  archive?: string
  unsupportedFields?: string[]
}
