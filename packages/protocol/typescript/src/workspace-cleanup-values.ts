import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  WorkspaceCleanupCandidateTier as ProtocolTier,
  type WorkspaceCleanupCandidate as ProtocolCandidate,
  type WorkspaceCleanupDismissal as ProtocolDismissal,
  type WorkspaceCleanupGitEvidence as ProtocolGitEvidence,
  type WorkspaceCleanupScanError as ProtocolScanError,
  type WorkspaceCleanupScanProgress as ProtocolScanProgress,
  type WorkspaceCleanupServiceDismissalsResponse as ProtocolDismissalsResponse,
  type WorkspaceCleanupServiceEvent as ProtocolEvent,
  type WorkspaceCleanupServiceScanResponse as ProtocolScanResponse
} from '../generated/yiru/runtime/v1/workspace_cleanup_pb.js'
import { RuntimeProtocolError } from './error.js'

export const WORKSPACE_CLEANUP_PROTOCOL_CAPABILITY = 'workspaceCleanup.protobuf.v1' as const

export type WorkspaceCleanupTier = 'ready' | 'review' | 'protected'

export type WorkspaceCleanupReason = 'archived' | 'idle-clean'

export type WorkspaceCleanupBlocker =
  | 'main-worktree'
  | 'folder-repo'
  | 'pinned'
  | 'active-workspace'
  | 'running-terminal'
  | 'terminal-liveness-unknown'
  | 'dirty-editor-buffer'
  | 'volatile-local-context'
  | 'recent-visible-context'
  | 'live-agent'
  | 'ssh-disconnected'
  | 'git-status-error'
  | 'dirty-files'
  | 'unpushed-commits'
  | 'unknown-base'
  | 'dismissed'

export type WorkspaceCleanupDismissal = {
  worktreeId: string
  dismissedAt: number
  fingerprint: string
  classifierVersion: number
}

export type WorkspaceCleanupCandidate = {
  worktreeId: string
  repoId: string
  repoName: string
  connectionId: string | null
  displayName: string
  branch: string
  path: string
  tier: WorkspaceCleanupTier
  selectedByDefault: boolean
  reasons: WorkspaceCleanupReason[]
  blockers: WorkspaceCleanupBlocker[]
  lastActivityAt: number
  createdAt?: number
  localContext: {
    terminalTabCount: number
    cleanEditorTabCount: number
    browserTabCount: number
    diffCommentCount: number
    newestDiffCommentAt: number | null
    retainedDoneAgentCount: number
  }
  git: {
    clean: boolean | null
    upstreamAhead: number | null
    upstreamBehind: number | null
    checkedAt: number | null
  }
  fingerprint: string
}

export type WorkspaceCleanupScanArgs = {
  worktreeId?: string
  skipGitWorktreeIds?: string[]
  scanId?: string
}

export type WorkspaceCleanupScanError = {
  repoId: string
  repoName: string
  message: string
}

export type WorkspaceCleanupScanResult = {
  scannedAt: number
  candidates: WorkspaceCleanupCandidate[]
  errors: WorkspaceCleanupScanError[]
}

export type WorkspaceCleanupScanProgress = WorkspaceCleanupScanResult & {
  scanId: string
  scannedWorktreeCount: number
  totalWorktreeCount: number
  candidateMode?: 'append' | 'snapshot'
}

export type WorkspaceCleanupEvent =
  | { type: 'ready'; subscriptionId: string }
  | { type: 'progress'; progress: WorkspaceCleanupScanProgress }

// Why: the authority persists dismissals keyed by worktree id, so the
// repeated wire list renders back into the record the renderer merges on.
export function decodeWorkspaceCleanupDismissals(
  response: ProtocolDismissalsResponse
): Record<string, WorkspaceCleanupDismissal> {
  const dismissals: Record<string, WorkspaceCleanupDismissal> = {}
  for (const dismissal of response.dismissals) {
    dismissals[dismissal.worktreeId] = decodeDismissal(dismissal)
  }
  return dismissals
}

export function decodeWorkspaceCleanupScan(
  response: ProtocolScanResponse
): WorkspaceCleanupScanResult {
  return {
    scannedAt: milliseconds(response.scannedAt, 'Scan time'),
    candidates: response.candidates.map(decodeCandidate),
    errors: response.errors.map(decodeScanError)
  }
}

export function decodeWorkspaceCleanupEvent(event: ProtocolEvent): WorkspaceCleanupEvent | null {
  switch (event.event.case) {
    case 'ready':
      return {
        type: 'ready',
        subscriptionId: requiredIdentity(
          event.event.value.subscriptionId,
          'Cleanup subscription ID'
        )
      }
    case 'progress':
      return { type: 'progress', progress: decodeProgress(event.event.value) }
    case undefined:
      return null
  }
}

function decodeProgress(progress: ProtocolScanProgress): WorkspaceCleanupScanProgress {
  const candidateMode = progress.candidateMode
  return {
    scanId: progress.scanId,
    scannedAt: milliseconds(progress.scannedAt, 'Scan progress time'),
    candidates: progress.candidates.map(decodeCandidate),
    errors: progress.errors.map(decodeScanError),
    scannedWorktreeCount: progress.scannedWorktreeCount,
    totalWorktreeCount: progress.totalWorktreeCount,
    ...(candidateMode === '' ? {} : { candidateMode: candidateMode as 'append' | 'snapshot' })
  }
}

function decodeCandidate(candidate: ProtocolCandidate): WorkspaceCleanupCandidate {
  const git = candidate.git
  const localContext = candidate.localContext
  return {
    worktreeId: requiredIdentity(candidate.worktreeId, 'Cleanup candidate worktree ID'),
    repoId: candidate.repoId,
    repoName: candidate.repoName,
    connectionId: candidate.connectionId ?? null,
    displayName: candidate.displayName,
    branch: candidate.branch,
    path: candidate.path,
    tier: tier(candidate.tier),
    selectedByDefault: candidate.selectedByDefault,
    reasons: candidate.reasons.map(decodeReason),
    blockers: candidate.blockers.map(decodeBlocker),
    lastActivityAt: milliseconds(candidate.lastActivityAt, 'Cleanup candidate activity'),
    ...(candidate.createdAt === undefined
      ? {}
      : { createdAt: milliseconds(candidate.createdAt, 'Cleanup candidate creation') }),
    localContext: {
      terminalTabCount: localContext?.terminalTabCount ?? 0,
      cleanEditorTabCount: localContext?.cleanEditorTabCount ?? 0,
      browserTabCount: localContext?.browserTabCount ?? 0,
      diffCommentCount: localContext?.diffCommentCount ?? 0,
      newestDiffCommentAt:
        localContext?.newestDiffCommentAt === undefined
          ? null
          : milliseconds(localContext.newestDiffCommentAt, 'Newest diff comment'),
      retainedDoneAgentCount: localContext?.retainedDoneAgentCount ?? 0
    },
    git: {
      clean: git?.clean ?? null,
      upstreamAhead: optionalCount(git, 'upstreamAhead', 'Cleanup upstream ahead'),
      upstreamBehind: optionalCount(git, 'upstreamBehind', 'Cleanup upstream behind'),
      checkedAt:
        git?.checkedAt === undefined ? null : milliseconds(git.checkedAt, 'Cleanup git check')
    },
    fingerprint: candidate.fingerprint
  }
}

function decodeDismissal(dismissal: ProtocolDismissal): WorkspaceCleanupDismissal {
  return {
    worktreeId: requiredIdentity(dismissal.worktreeId, 'Cleanup dismissal worktree ID'),
    dismissedAt: dismissal.dismissedAt,
    fingerprint: dismissal.fingerprint,
    classifierVersion: dismissal.classifierVersion
  }
}

function decodeScanError(error: ProtocolScanError): WorkspaceCleanupScanError {
  return { repoId: error.repoId, repoName: error.repoName, message: error.message }
}

function tier(value: ProtocolTier): WorkspaceCleanupTier {
  switch (value) {
    case ProtocolTier.READY:
      return 'ready'
    case ProtocolTier.REVIEW:
      return 'review'
    case ProtocolTier.PROTECTED:
      return 'protected'
    case ProtocolTier.UNSPECIFIED:
      throw invalidResponse('Cleanup candidate tier is unspecified')
  }
}

function decodeReason(value: string): WorkspaceCleanupReason {
  if (value === 'archived' || value === 'idle-clean') {
    return value
  }
  throw invalidResponse('Cleanup candidate reason is unknown')
}

function decodeBlocker(value: string): WorkspaceCleanupBlocker {
  if (isCleanupBlocker(value)) {
    return value
  }
  throw invalidResponse('Cleanup candidate blocker is unknown')
}

const CLEANUP_BLOCKERS: ReadonlySet<string> = new Set([
  'main-worktree',
  'folder-repo',
  'pinned',
  'active-workspace',
  'running-terminal',
  'terminal-liveness-unknown',
  'dirty-editor-buffer',
  'volatile-local-context',
  'recent-visible-context',
  'live-agent',
  'ssh-disconnected',
  'git-status-error',
  'dirty-files',
  'unpushed-commits',
  'unknown-base',
  'dismissed'
])

function isCleanupBlocker(value: string): value is WorkspaceCleanupBlocker {
  return CLEANUP_BLOCKERS.has(value)
}

function optionalCount(
  git: ProtocolGitEvidence | undefined,
  field: 'upstreamAhead' | 'upstreamBehind',
  label: string
): number | null {
  const value = git?.[field]
  return value === undefined ? null : count(value, label)
}

function count(value: bigint, label: string): number {
  if (value < 0n) {
    throw invalidResponse(`${label} is negative`)
  }
  return Number(value)
}

function milliseconds(value: bigint, label: string): number {
  return count(value, label)
}

function requiredIdentity(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
