import type { RepoAgentValue, RepoExecutionHostId } from './repo-types.js'

export type WorktreePushTarget = {
  remoteName: string
  branchName: string
  remoteUrl?: string
  remoteCreated?: boolean
}

export type WorktreeGitInfo = {
  path: string
  head: string
  branch: string
  isBare: boolean
  isSparse?: boolean
  locked?: boolean
  lockReason?: string
  prunable?: boolean
  prunableReason?: string
  isMainWorktree: boolean
}

export type WorktreeLineageCapture = {
  source:
    | 'explicit-cli-flag'
    | 'env-workspace'
    | 'cwd-context'
    | 'terminal-context'
    | 'orchestration-context'
    | 'active-workspace'
    | 'manual-action'
  confidence: 'explicit' | 'inferred'
}

export type WorktreeLineage = {
  worktreeId: string
  worktreeInstanceId: string
  parentWorktreeId: string
  parentWorktreeInstanceId: string
  origin: 'orchestration' | 'cli' | 'manual'
  capture: WorktreeLineageCapture
  orchestrationRunId?: string
  taskId?: string
  coordinatorHandle?: string
  createdByTerminalHandle?: string
  createdAt: number
}

export type WorktreeWorkspaceLineage = {
  childWorkspaceKey: `worktree:${string}` | `folder:${string}`
  childInstanceId?: string | null
  parentWorkspaceKey: `worktree:${string}` | `folder:${string}`
  parentInstanceId?: string | null
  origin: 'orchestration' | 'cli' | 'manual'
  capture: WorktreeLineageCapture
  taskId?: string
  orchestrationRunId?: string
  coordinatorHandle?: string
  createdByTerminalHandle?: string
  createdAt: number
}

export type WorktreeDiffComment = {
  id: string
  worktreeId: string
  filePath: string
  source?: 'diff' | 'markdown'
  selectedText?: string
  startLine?: number
  lineNumber: number
  body: string
  createdAt: number
  updatedAt?: number
  sentAt?: number
  scope?: 'unstaged' | 'staged' | 'branch'
  oldPath?: string
  diffIdentity?: string
  side: 'modified'
}

export type WorktreeMobileDiffReviewFile = {
  key: string
  filePath: string
  oldPath?: string
  scope: 'unstaged' | 'staged' | 'branch'
  lastOpenedAt?: number
  lastSeenDiffIdentity?: string
  reviewedAt?: number
  reviewDiffIdentity?: string
}

export type WorktreeValue = WorktreeGitInfo & {
  id: string
  instanceId?: string
  repoId: string
  projectId?: string
  hostId?: RepoExecutionHostId
  projectHostSetupId?: string
  displayName: string
  comment: string
  linkedPR: number | null
  isArchived: boolean
  isUnread: boolean
  isPinned: boolean
  sortOrder: number
  manualOrder?: number
  lastActivityAt: number
  createdAt?: number
  createdWithAgent?: RepoAgentValue
  pendingFirstAgentMessageRename?: boolean
  firstAgentMessageRenameError?: string | null
  sparseDirectories?: string[]
  sparseBaseRef?: string
  sparsePresetId?: string
  baseRef?: string
  pushTarget?: WorktreePushTarget
  priorWorktreeIds?: string[]
  workspaceStatus?: string
  diffComments?: WorktreeDiffComment[]
  mobileDiffReview?: {
    version: 1
    updatedAt?: number
    completedAt?: number
    files: Record<string, WorktreeMobileDiffReviewFile>
  }
  parentWorktreeId: string | null
  childWorktreeIds: string[]
  lineage: WorktreeLineage | null
  workspaceLineage?: WorktreeWorkspaceLineage | null
  git: WorktreeGitInfo
}

export type WorktreeCreateInput = {
  repo: string
  expectedRevision: number
  operationId?: string
  name?: string
  baseBranch?: string
  compareBaseRef?: string
  branchNameOverride?: string
  linkedPR?: number | null
  comment?: string
  displayName?: string
  telemetrySource?: string
  workspaceStatus?: string
  manualOrder?: number
  sparseCheckout?: { directories: string[]; presetId?: string }
  pushTarget?: WorktreePushTarget
  runHooks?: boolean
  activate?: boolean
  parentWorkspace?: string
  envParentWorkspace?: string
  parentWorktree?: string
  cwdParentWorktree?: string
  noParent?: boolean
  callerTerminalHandle?: string
  orchestrationContext?: {
    parentWorktreeId?: string
    orchestrationRunId?: string
    taskId?: string
    coordinatorHandle?: string
  }
  setupDecision?: 'run' | 'skip' | 'inherit'
  startupCommand?: string
  startupEnv?: Record<string, string>
  startupLaunchConfig?: {
    agentCommand?: string
    agentArgs: string
    agentEnv: Record<string, string>
    ompResumeFilePath?: string
  }
  startupCommandDelivery?: 'fast' | 'shell-ready'
  startupAgent?: RepoAgentValue
  startupPrompt?: string
  startupDraft?: string
  createdWithAgent?: RepoAgentValue
  pendingFirstAgentMessageRename?: boolean
}

export type WorktreeCreateResult = {
  revision?: number
  worktree: WorktreeValue
  lineage?: WorktreeLineage | null
  workspaceLineage?: WorktreeWorkspaceLineage | null
  warnings?: {
    code:
      | 'LINEAGE_PARENT_CONTEXT_MISSING'
      | 'LINEAGE_PARENT_CONTEXT_CONFLICT'
      | 'LINEAGE_PARENT_INSTANCE_STALE'
    message: string
    details?: Record<string, string>
  }[]
  setup?: {
    runnerScriptPath: string
    envVars: Record<string, string>
    command?: string
    waitForAgentStartup?: boolean
  }
  setupReceipt?: {
    requested: 'run' | 'skip' | 'inherit'
    hookFound: boolean
    startupPolicy: 'wait-for-setup' | 'start-immediately'
    state: 'not_configured' | 'skipped' | 'running' | 'spawn_failed'
    terminalHandle?: string
  }
  defaultTabs?: {
    tabs: { title?: string; color?: string; command?: string }[]
    runCommands: boolean
  }
  warning?: string
  initialBaseStatus?: {
    repoId: string
    worktreeId: string
    status: 'checking' | 'current' | 'drift' | 'base_changed' | 'unknown'
    base: string
    remote?: string
    behind?: number
    recentSubjects?: string[]
  }
  localBaseRefRefresh?: {
    status: 'updated' | 'skipped_dirty_worktree' | 'skipped_not_fast_forward' | 'skipped_error'
    baseRef: string
    localBranch: string
    ownerWorktreePath?: string
  }
  localBaseRefUpdateSuggestion?: { baseRef: string; localBranch: string; behind: number }
  startupTerminal?: {
    spawned: boolean
    handle?: string
    tabId?: string
    paneKey?: string | null
    ptyId?: string | null
    surface?: 'visible' | 'background'
  }
  timing?: {
    totalDurationMs: number
    phases: { phase: string; startedAtMs: number; durationMs: number }[]
  }
  agentTerminalHandle?: string
}

export type WorktreeListResult = {
  worktrees: WorktreeValue[]
  totalCount: number
  truncated: boolean
}

export type WorktreeArchiveValue = {
  branch: string
  createdAt: number
  failureDetail: string | null
  head: string
  id: string
  originalWorktreeId: string
  path: string
  repoId: string
  restoredAt: number | null
  stashOid: string | null
  status: 'archiving' | 'archived' | 'failed' | 'restored'
}
