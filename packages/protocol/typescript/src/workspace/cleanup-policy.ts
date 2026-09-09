import type {
  WorkspaceCleanupTier,
  WorkspaceCleanupBlocker,
  WorkspaceCleanupCandidate,
  WorkspaceCleanupDismissal,
  WorkspaceCleanupReason
} from '../workspace-cleanup-values.js'

export const WORKSPACE_CLEANUP_CLASSIFIER_VERSION = 2
export const WORKSPACE_CLEANUP_ARCHIVED_IDLE_MS = 7 * 24 * 60 * 60 * 1000
export const WORKSPACE_CLEANUP_IDLE_MS = 30 * 24 * 60 * 60 * 1000

export type WorkspaceCleanupInactivityInput = { isArchived: boolean; lastActivityAt: number }
export type WorkspaceCleanupUIState = { dismissals: Record<string, WorkspaceCleanupDismissal> }

export const WORKSPACE_CLEANUP_HARD_BLOCKERS: ReadonlySet<WorkspaceCleanupBlocker> = new Set([
  'main-worktree',
  'folder-repo',
  'pinned',
  'active-workspace',
  'running-terminal',
  'terminal-liveness-unknown',
  'dirty-editor-buffer',
  'volatile-local-context',
  'live-agent',
  'recent-visible-context',
  'ssh-disconnected',
  'git-status-error',
  'dirty-files',
  'unpushed-commits',
  'unknown-base',
  'dismissed'
])

const WORKSPACE_CLEANUP_QUEUE_BLOCKERS: ReadonlySet<WorkspaceCleanupBlocker> = new Set([
  'main-worktree',
  'folder-repo',
  'dismissed'
])

export const WORKSPACE_CLEANUP_FORCE_REMOVE_BLOCKERS: ReadonlySet<WorkspaceCleanupBlocker> =
  new Set(['dirty-files', 'unpushed-commits', 'unknown-base', 'git-status-error'])

export function isWorkspaceCleanupHardBlocker(blocker: WorkspaceCleanupBlocker): boolean {
  return WORKSPACE_CLEANUP_HARD_BLOCKERS.has(blocker)
}

export function canQueueWorkspaceCleanupCandidate(
  candidate: Pick<WorkspaceCleanupCandidate, 'blockers' | 'reasons'>
): boolean {
  return (
    candidate.reasons.length > 0 &&
    !candidate.blockers.some((blocker) => WORKSPACE_CLEANUP_QUEUE_BLOCKERS.has(blocker))
  )
}

export function shouldForceWorkspaceCleanupRemoval(
  candidate: Pick<WorkspaceCleanupCandidate, 'blockers' | 'git'>
): boolean {
  return (
    candidate.git.clean !== true ||
    candidate.git.checkedAt === null ||
    candidate.blockers.some((blocker) => WORKSPACE_CLEANUP_FORCE_REMOVE_BLOCKERS.has(blocker))
  )
}

export function canSelectWorkspaceCleanupCandidate(
  candidate: Pick<WorkspaceCleanupCandidate, 'blockers' | 'git' | 'reasons'>
): boolean {
  return (
    candidate.reasons.length > 0 &&
    candidate.git.clean === true &&
    candidate.git.checkedAt !== null &&
    !candidate.blockers.some(isWorkspaceCleanupHardBlocker)
  )
}

export function applyWorkspaceCleanupPolicy(
  candidate: WorkspaceCleanupCandidate
): WorkspaceCleanupCandidate {
  const canSelect = canSelectWorkspaceCleanupCandidate(candidate)
  const hasHardBlocker = candidate.blockers.some(isWorkspaceCleanupHardBlocker)
  const tier: WorkspaceCleanupTier = hasHardBlocker ? 'protected' : canSelect ? 'ready' : 'review'

  return {
    ...candidate,
    tier,
    selectedByDefault: tier === 'ready' && canSelect
  }
}

export function createWorkspaceCleanupFingerprint(args: {
  branch: string
  head: string
  gitClean: boolean | null
  lastActivityAt: number
  classifierVersion?: number
}): string {
  const version = args.classifierVersion ?? WORKSPACE_CLEANUP_CLASSIFIER_VERSION
  const lastActivityBucket = Math.floor((args.lastActivityAt || 0) / (24 * 60 * 60 * 1000))
  return [
    version,
    args.branch,
    args.head,
    args.gitClean === null ? 'unknown' : args.gitClean ? 'clean' : 'dirty',
    lastActivityBucket
  ].join('|')
}

export function getWorkspaceCleanupInactivityReasons(
  workspace: WorkspaceCleanupInactivityInput,
  scannedAt: number
): WorkspaceCleanupReason[] {
  const reasons: WorkspaceCleanupReason[] = []
  if (
    workspace.isArchived &&
    scannedAt - workspace.lastActivityAt >= WORKSPACE_CLEANUP_ARCHIVED_IDLE_MS
  ) {
    reasons.push('archived')
  }
  if (scannedAt - workspace.lastActivityAt >= WORKSPACE_CLEANUP_IDLE_MS) {
    reasons.push('idle-clean')
  }
  return reasons
}

export function isWorkspaceOldForCleanup(
  workspace: WorkspaceCleanupInactivityInput,
  scannedAt: number
): boolean {
  return getWorkspaceCleanupInactivityReasons(workspace, scannedAt).length > 0
}

export function shouldHideWorkspaceCleanupCandidate(
  candidate: Pick<WorkspaceCleanupCandidate, 'worktreeId' | 'fingerprint'>,
  dismissal: WorkspaceCleanupDismissal | undefined
): boolean {
  return (
    dismissal?.worktreeId === candidate.worktreeId &&
    dismissal.fingerprint === candidate.fingerprint &&
    dismissal.classifierVersion === WORKSPACE_CLEANUP_CLASSIFIER_VERSION
  )
}
