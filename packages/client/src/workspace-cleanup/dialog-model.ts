import type {
  WorkspaceCleanupCandidate,
  WorkspaceCleanupScanError,
  WorkspaceCleanupScanProgress
} from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import type { WorkspaceCleanupRemovalProgress } from './background-removal'
import type { WorkspaceCleanupFilters, WorkspaceCleanupReviewInfo } from './presentation'

export const DEFAULT_FILTERS: WorkspaceCleanupFilters = {
  query: '',
  time: 'all',
  review: 'all',
  git: 'all',
  context: 'all'
}

export const EMPTY_REVIEW_INFO: WorkspaceCleanupReviewInfo = {
  hasReview: false,
  label: null,
  state: null,
  provider: null,
  title: null
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) {
    return 'Never'
  }
  const deltaMs = Date.now() - timestamp
  if (deltaMs < 60_000) {
    return 'Just now'
  }
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 48) {
    return `${hours}h ago`
  }
  return `${Math.floor(hours / 24)}d ago`
}

function isDisconnectedRemoteScanError(message: string): boolean {
  return (
    message === 'SSH provider is unavailable.' ||
    message === 'Remote workspaces are not connected. Reconnect and refresh to check them.'
  )
}

export function formatScanNoticeMessage(
  errors: WorkspaceCleanupScanError[],
  repoNameById: Map<string, string>
): string | null {
  const visibleErrors = errors.filter(
    (error) => !isDisconnectedRemoteScanError(error.message ?? '')
  )
  if (visibleErrors.length === 0) {
    return null
  }
  if (visibleErrors.length === 1) {
    const error = visibleErrors[0]
    const repoName = formatScanErrorRepoName(error, repoNameById)
    return `Could not check ${repoName}: ${formatScanErrorReason(error.message)}. Some inactive workspaces may be missing. Refresh to try again.`
  }
  const repoNames = visibleErrors
    .slice(0, 3)
    .map((error) => formatScanErrorRepoName(error, repoNameById))
    .join(', ')
  const moreCount = visibleErrors.length - 3
  const suffix = moreCount > 0 ? `, +${moreCount} more` : ''
  return `Could not check ${visibleErrors.length} repositories (${repoNames}${suffix}). Some inactive workspaces may be missing. Refresh to try again.`
}

function formatScanErrorRepoName(
  error: Partial<WorkspaceCleanupScanError>,
  repoNameById: Map<string, string>
): string {
  const repoName = error.repoName?.trim()
  if (repoName) {
    return repoName
  }
  const fallback = error.repoId ? repoNameById.get(error.repoId)?.trim() : ''
  return fallback || 'a repository'
}

function formatScanErrorReason(message: string | undefined): string {
  if (!message || message === 'Could not scan workspace cleanup for this repository.') {
    return 'Git could not list worktrees'
  }
  return message.replace(/\.$/, '')
}

export function hasActiveWorkspaceCleanupFilters(filters: WorkspaceCleanupFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.time !== 'all' ||
    filters.review !== 'all' ||
    filters.git !== 'all' ||
    filters.context !== 'all'
  )
}

export function getDefaultSelectedWorkspaceCleanupIds(
  candidates: readonly WorkspaceCleanupCandidate[],
  deletingWorktreeIds: ReadonlySet<string> = new Set()
): Set<string> {
  return new Set(
    candidates
      .filter(
        (candidate) => candidate.selectedByDefault && !deletingWorktreeIds.has(candidate.worktreeId)
      )
      .map((candidate) => candidate.worktreeId)
  )
}

export function formatWorkspaceCleanupReadyToastDescription(
  inactiveCount: number,
  suggestedCount: number
): string {
  if (inactiveCount === 0) {
    return 'No inactive workspaces found.'
  }
  const inactiveNoun = inactiveCount === 1 ? 'workspace' : 'workspaces'
  const suggestedNoun = suggestedCount === 1 ? 'suggestion' : 'suggestions'
  return `${inactiveCount} inactive ${inactiveNoun} found, with ${suggestedCount} cleanup ${suggestedNoun}.`
}

export function formatWorkspaceCleanupRemovalProgress(
  progress: WorkspaceCleanupRemovalProgress
): string {
  const deletedText = translate(
    'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4c2990886e',
    '{{value0}}/{{value1}} deleted',
    {
      value0: progress.removedCount,
      value1: progress.totalCount
    }
  )
  if (progress.failedCount === 0) {
    return deletedText
  }
  return translate(
    'auto.components.workspace.cleanup.WorkspaceCleanupDialog.86ba852118',
    '{{value0}}, {{value1}} failed',
    {
      value0: deletedText,
      value1: progress.failedCount
    }
  )
}

export function formatWorkspaceCleanupProgress(
  progress: WorkspaceCleanupScanProgress | null
): string {
  if (!progress || progress.scannedWorktreeCount === 0) {
    return translate(
      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4cc5b73efe',
      'Finding inactive workspaces...'
    )
  }
  return translate(
    'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7b7bde5181',
    'Checked workspaces so far: {{value0}}',
    {
      value0: progress.scannedWorktreeCount
    }
  )
}

export function toggleSetMember(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  return next
}
