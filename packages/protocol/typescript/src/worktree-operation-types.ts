import type {
  WorktreeLineage,
  WorktreePushTarget,
  WorktreeValue,
  WorktreeWorkspaceLineage
} from './worktree-types.js'

export type WorktreeShowResult = { revision?: number; worktree: WorktreeValue }
export type WorktreeSleepResult = { worktreeId: string }
export type WorktreeActivateInput = { worktree: string; notifyClients?: boolean }
export type WorktreeActivateResult = {
  repoId: string
  worktreeId: string
  activated: boolean
  sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable'
}

export type WorktreeRemoveInput = {
  worktree: string
  expectedRevision: number
  force?: boolean
  runHooks?: boolean
}
export type WorktreeRemoveResult = {
  revision?: number
  removed: boolean
  preservedBranch?: { branchName: string; head?: string }
}

export type WorktreeForceDeleteBranchInput = {
  worktree: string
  branchName: string
  expectedHead: string
}
export type WorktreeForceDeleteBranchResult = { deleted: true }

// Why: presence, not value, decides whether `set` touches a field — a patch
// key that is absent leaves the metadata untouched, so every field here is
// optional and `null` is the explicit "clear this" signal where supported.
export type WorktreeSetPatch = {
  displayName?: string
  sparseBaseRef?: string
  sparsePresetId?: string
  baseRef?: string
  workspaceStatus?: string
  comment?: string
  isArchived?: boolean
  isUnread?: boolean
  isPinned?: boolean
  pendingFirstAgentMessageRename?: boolean
  sortOrder?: number
  manualOrder?: number
  lastActivityAt?: number
  createdAt?: number
  linkedPR?: number | null
  sparseDirectories?: string[]
  pushTarget?: WorktreePushTarget | null
  diffComments?: WorktreeValue['diffComments']
  mobileDiffReview?: WorktreeValue['mobileDiffReview']
}
export type WorktreeSetInput = {
  worktree: string
  expectedRevision: number
  patch: WorktreeSetPatch
}

export type WorktreePersistSortOrderResult = { updated: number }

export type WorktreeDetectedWorktreeValue = WorktreeValue & {
  ownership: 'agentstart-managed' | 'external' | 'unknown-legacy'
  selectedCheckout: boolean
  visible: boolean
}
export type WorktreeDetectedListResult = {
  revision?: number
  repoId: string
  authoritative: boolean
  source: 'git' | 'metadata-fallback' | 'session-fallback'
  worktrees: WorktreeDetectedWorktreeValue[]
}

export type WorktreeLineageListResult = {
  lineage: Record<string, WorktreeLineage>
  workspaceLineage: Record<string, WorktreeWorkspaceLineage>
}

export type WorktreePrefetchCreateBaseInput = { repo: string; baseBranch?: string }

export type WorktreeResolvePrBaseInput = {
  repo: string
  prNumber: number
  headRefName?: string
  baseRefName?: string
  isCrossRepository?: boolean
}
type WorktreePrBaseSuccess = {
  baseBranch: string
  headSha: string
  branchNameOverride?: string
  compareBaseRef?: string
  pushTarget?: WorktreePushTarget
}
export type WorktreePrBaseResult = WorktreePrBaseSuccess | { error: string }

export type WorktreePsSummary = {
  workspaceKind: string
  worktreeId: string
  repoId: string
  hostId: string
  resumeTargetStatus: string
  terminalPlatform: string
  priorWorktreeIds?: string[]
  repo: string
  path: string
  branch: string
  displayName: string
  workspaceStatus: string
  isArchived: boolean
  isMainWorktree: boolean
  hasHostSidebarActivity: boolean
  worktreeInstanceId?: string
  parentWorktreeId: string | null
  childWorktreeIds: string[]
  sortOrder: number
  manualOrder?: number
  lastActivityAt?: number
  createdAt?: number
  linkedPR: { number: number; state: string } | null
  comment: string
  isPinned: boolean
  isActive: boolean
  unread: boolean
  liveTerminalCount: number
  hasAttachedPty: boolean
  lastOutputAt: number | null
  preview: string
  status: string
  agents: WorktreePsAgentRow[]
}
export type WorktreePsResult = {
  worktrees: WorktreePsSummary[]
  totalCount: number
  truncated: boolean
}

type WorktreePsAgentRow = {
  paneKey: string
  parentPaneKey?: string
  state: string
  agentType?: string
  prompt: string
  taskTitle?: string
  displayName?: string
  lastAssistantMessage?: string
  toolName?: string
  toolInput?: string
  interrupted: boolean
  stateStartedAt: number
  updatedAt: number
}

type WorktreeBaseStatusKind = 'checking' | 'current' | 'drift' | 'base_changed' | 'unknown'
type WorktreeBaseStatusEvent = {
  repoId: string
  worktreeId: string
  status: WorktreeBaseStatusKind
  base: string
  behind?: number
}
export type WorktreeStateSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | ({ type: 'baseStatus' } & WorktreeBaseStatusEvent)
