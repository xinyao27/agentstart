import {
  GitHubFileStatus,
  GitHubFileViewedState,
  type GitHubFileEntry,
  type GitHubWorkItem as ProtocolWorkItem,
  type GitHubWorkItemDetails as ProtocolWorkItemDetails
} from '../../generated/agent_start/runtime/v1/github_pb.js'
import { githubCheckEntry } from './check-values.js'
import type { PRCheckDetail } from './check-values.js'
import { githubComment, type PRComment } from './comment-values.js'
import type { GitHubPRFile, GitHubPRFileViewedState } from './pr-file-values.js'
import {
  prState,
  mergeable,
  checksStatus,
  reviewDecision,
  mergeMethodSettings,
  githubOwnerRepo,
  user,
  reviewSummary,
  type GitHubAssignableUser,
  type GitHubOwnerRepo,
  type GitHubPRCheckSummary,
  type GitHubPRMergeMethodSettings,
  type GitHubPRReviewSummary,
  type PRMergeableState,
  type PRReviewDecision,
  type PRState
} from './values.js'

export type GitHubWorkItem = {
  id: string
  type: 'pr'
  number: number
  title: string
  state: PRState
  url: string
  labels: string[]
  updatedAt: string
  author: string | null
  authorAvatarUrl?: string
  branchName?: string
  baseRefName?: string
  headSha?: string
  prRepo?: GitHubOwnerRepo
  additions?: number
  deletions?: number
  changedFiles?: number
  reviewDecision?: PRReviewDecision | null
  reviewRequests?: GitHubAssignableUser[]
  latestReviews?: GitHubPRReviewSummary[]
  assignees?: GitHubAssignableUser[]
  checksSummary?: GitHubPRCheckSummary
  mergeable?: PRMergeableState
  autoMergeEnabled?: boolean
  autoMergeAllowed?: boolean | null
  mergeQueueRequired?: boolean | null
  mergeMethodSettings?: GitHubPRMergeMethodSettings
  mergeStateStatus?: string | null
  maintainerCanModify?: boolean
  isCrossRepository?: boolean
}

export type GitHubWorkItemDetails = {
  item: Omit<GitHubWorkItem, 'repoId'>
  body: string
  comments: PRComment[]
  headSha?: string
  baseSha?: string
  pullRequestId?: string
  checks?: PRCheckDetail[]
  files?: GitHubPRFile[]
  filesUnavailable?: boolean
  participants?: GitHubAssignableUser[]
  assignees?: string[]
}

export function githubWorkItem(item: ProtocolWorkItem): GitHubWorkItem {
  return {
    id: item.id,
    type: 'pr',
    number: Number(item.number),
    title: item.title,
    state: prState(item.state),
    url: item.url,
    labels: item.labels,
    updatedAt: item.updatedAt,
    author: item.author ?? null,
    ...(item.authorAvatarUrl !== undefined ? { authorAvatarUrl: item.authorAvatarUrl } : {}),
    ...(item.branchName ? { branchName: item.branchName } : {}),
    ...(item.baseRefName ? { baseRefName: item.baseRefName } : {}),
    ...(item.headSha !== undefined ? { headSha: item.headSha } : {}),
    ...(item.prRepo ? { prRepo: githubOwnerRepo(item.prRepo) ?? undefined } : {}),
    ...(item.additions !== undefined ? { additions: Number(item.additions) } : {}),
    ...(item.deletions !== undefined ? { deletions: Number(item.deletions) } : {}),
    ...(item.changedFiles !== undefined ? { changedFiles: Number(item.changedFiles) } : {}),
    reviewDecision: reviewDecision(item.reviewDecision),
    reviewRequests: item.reviewRequests.map(user),
    latestReviews: item.latestReviews.map(reviewSummary),
    assignees: item.assignees.map(user),
    ...(item.checksSummary
      ? {
          checksSummary: {
            state:
              checksStatus(item.checksSummary.state) === 'pending'
                ? 'pending'
                : checksStatus(item.checksSummary.state),
            total: item.checksSummary.total,
            passed: item.checksSummary.passed,
            failed: item.checksSummary.failed,
            pending: item.checksSummary.pending
          } as GitHubPRCheckSummary
        }
      : {}),
    ...(item.mergeable !== undefined ? { mergeable: mergeable(item.mergeable) } : {}),
    ...(item.autoMergeEnabled !== undefined ? { autoMergeEnabled: item.autoMergeEnabled } : {}),
    ...(item.autoMergeAllowed !== undefined ? { autoMergeAllowed: item.autoMergeAllowed } : {}),
    ...(item.mergeQueueRequired !== undefined
      ? { mergeQueueRequired: item.mergeQueueRequired }
      : {}),
    ...(item.mergeMethodSettings
      ? { mergeMethodSettings: mergeMethodSettings(item.mergeMethodSettings) }
      : {}),
    ...(item.mergeStateStatus !== undefined ? { mergeStateStatus: item.mergeStateStatus } : {}),
    ...(item.maintainerCanModify !== undefined
      ? { maintainerCanModify: item.maintainerCanModify }
      : {}),
    ...(item.isCrossRepository !== undefined ? { isCrossRepository: item.isCrossRepository } : {})
  }
}

export function githubWorkItemDetails(
  details: ProtocolWorkItemDetails | undefined
): GitHubWorkItemDetails | null {
  if (!details?.item) {
    return null
  }
  return {
    item: githubWorkItem(details.item),
    body: details.body,
    comments: details.comments.map(githubComment),
    ...(details.headSha !== undefined ? { headSha: details.headSha } : {}),
    ...(details.baseSha !== undefined ? { baseSha: details.baseSha } : {}),
    ...(details.pullRequestId !== undefined ? { pullRequestId: details.pullRequestId } : {}),
    checks: details.checks.map(githubCheckEntry),
    files: details.files.map(file),
    filesUnavailable: details.filesUnavailable,
    participants: details.participants.map(user),
    assignees: details.assignees
  }
}

function file(entry: GitHubFileEntry): GitHubPRFile {
  return {
    path: entry.path,
    ...(entry.oldPath !== undefined ? { oldPath: entry.oldPath } : {}),
    status: fileStatus(entry.status),
    additions: Number(entry.additions),
    deletions: Number(entry.deletions),
    isBinary: entry.isBinary,
    reviewCommentLineNumbers: entry.reviewCommentLineNumbers.map(Number),
    viewerViewedState: fileViewedState(entry.viewedState)
  }
}

function fileStatus(value: GitHubFileStatus): GitHubPRFile['status'] {
  switch (value) {
    case GitHubFileStatus.ADDED:
      return 'added'
    case GitHubFileStatus.REMOVED:
      return 'removed'
    case GitHubFileStatus.RENAMED:
      return 'renamed'
    case GitHubFileStatus.COPIED:
      return 'copied'
    case GitHubFileStatus.CHANGED:
      return 'changed'
    case GitHubFileStatus.UNCHANGED:
      return 'unchanged'
    default:
      return 'modified'
  }
}

function fileViewedState(value: GitHubFileViewedState): GitHubPRFileViewedState {
  switch (value) {
    case GitHubFileViewedState.VIEWED:
      return 'VIEWED'
    case GitHubFileViewedState.DISMISSED:
      return 'DISMISSED'
    default:
      return 'UNVIEWED'
  }
}
