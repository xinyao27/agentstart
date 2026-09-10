import { WorktreeSleepingAgentWake } from '../generated/agent_start/runtime/v1/worktree_pb.js'
import type {
  WorktreePushTarget as ProtocolPushTarget,
  WorktreeServiceActivateResponse,
  WorktreeServiceRemoveResponse,
  WorktreeServiceResolvePrBaseResponse
} from '../generated/agent_start/runtime/v1/worktree_pb.js'
import type {
  WorktreeActivateResult,
  WorktreePrBaseResult,
  WorktreeRemoveResult,
  WorktreeSetPatch
} from './worktree-operation-types.js'

export function worktreeActivateResult(
  value: WorktreeServiceActivateResponse
): WorktreeActivateResult {
  return {
    repoId: required(value.repoId, 'Activated worktree repository ID'),
    worktreeId: required(value.worktreeId, 'Activated worktree ID'),
    activated: value.activated,
    sleepingAgentWake: oneOfEnum(
      value.sleepingAgentWake,
      {
        [WorktreeSleepingAgentWake.REQUESTED]: 'requested',
        [WorktreeSleepingAgentWake.UNSUPPORTED_HEADLESS]: 'unsupported-headless',
        [WorktreeSleepingAgentWake.NOT_APPLICABLE]: 'not-applicable'
      } as const,
      'Sleeping agent wake'
    )
  }
}

export function worktreeRemoveResult(value: WorktreeServiceRemoveResponse): WorktreeRemoveResult {
  const output: WorktreeRemoveResult = { removed: value.removed }
  if (value.revision !== undefined) {
    output.revision = safeInteger(value.revision)
  }
  if (value.preservedBranch) {
    output.preservedBranch = {
      branchName: required(value.preservedBranch.branchName, 'Preserved branch name'),
      ...(value.preservedBranch.head ? { head: value.preservedBranch.head } : {})
    }
  }
  return output
}

export function worktreeResolvePrBaseResult(
  value: WorktreeServiceResolvePrBaseResponse
): WorktreePrBaseResult {
  switch (value.result.case) {
    case 'error':
      return { error: value.result.value }
    case 'success': {
      const success = value.result.value
      return {
        baseBranch: success.baseBranch,
        headSha: success.headSha,
        ...(success.branchNameOverride ? { branchNameOverride: success.branchNameOverride } : {}),
        ...(success.compareBaseRef ? { compareBaseRef: success.compareBaseRef } : {}),
        ...(success.pushTarget ? { pushTarget: pushTargetValue(success.pushTarget) } : {})
      }
    }
    case undefined:
      throw new TypeError('Worktree resolve-pr-base response is empty')
  }
}

function pushTargetValue(value: ProtocolPushTarget) {
  return {
    remoteName: required(value.remoteName, 'Push target remote'),
    branchName: required(value.branchName, 'Push target branch'),
    ...(value.remoteUrl ? { remoteUrl: value.remoteUrl } : {}),
    ...(value.remoteCreated === undefined ? {} : { remoteCreated: value.remoteCreated })
  }
}

// Why: presence, not value, decides whether `set` touches a field — every
// field is wrapped so an absent key in `patch` produces an absent field on
// the wire instead of a zero value the daemon would read as "clear this".
// The return value is a plain protobuf-es init shape (not a constructed
// `Message`), matching how every other nested field is built in this client.
export function worktreeSetPatchValue(patch: WorktreeSetPatch) {
  return {
    ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
    ...(patch.sparseBaseRef === undefined ? {} : { sparseBaseRef: patch.sparseBaseRef }),
    ...(patch.sparsePresetId === undefined ? {} : { sparsePresetId: patch.sparsePresetId }),
    ...(patch.baseRef === undefined ? {} : { baseRef: patch.baseRef }),
    ...(patch.workspaceStatus === undefined ? {} : { workspaceStatus: patch.workspaceStatus }),
    ...(patch.comment === undefined ? {} : { comment: patch.comment }),
    ...(patch.isArchived === undefined ? {} : { isArchived: patch.isArchived }),
    ...(patch.isUnread === undefined ? {} : { isUnread: patch.isUnread }),
    ...(patch.isPinned === undefined ? {} : { isPinned: patch.isPinned }),
    ...(patch.pendingFirstAgentMessageRename === undefined
      ? {}
      : { pendingFirstAgentMessageRename: patch.pendingFirstAgentMessageRename }),
    ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
    ...(patch.manualOrder === undefined ? {} : { manualOrder: patch.manualOrder }),
    ...(patch.lastActivityAt === undefined ? {} : { lastActivityAt: patch.lastActivityAt }),
    ...(patch.createdAt === undefined ? {} : { createdAt: patch.createdAt }),
    ...(patch.linkedPR === undefined
      ? {}
      : {
          linkedPr: {
            value:
              patch.linkedPR === null
                ? { case: 'null' as const, value: true }
                : { case: 'number' as const, value: revision(patch.linkedPR) }
          }
        }),
    ...(patch.sparseDirectories === undefined
      ? {}
      : { sparseDirectories: { values: patch.sparseDirectories } }),
    ...(patch.pushTarget === undefined
      ? {}
      : {
          pushTarget: {
            value:
              patch.pushTarget === null
                ? { case: 'null' as const, value: true }
                : {
                    case: 'target' as const,
                    value: {
                      remoteName: patch.pushTarget.remoteName,
                      branchName: patch.pushTarget.branchName,
                      ...(patch.pushTarget.remoteUrl === undefined
                        ? {}
                        : { remoteUrl: patch.pushTarget.remoteUrl }),
                      ...(patch.pushTarget.remoteCreated === undefined
                        ? {}
                        : { remoteCreated: patch.pushTarget.remoteCreated })
                    }
                  }
          }
        }),
    ...(patch.diffComments === undefined
      ? {}
      : { diffComments: { values: patch.diffComments.map(diffCommentValue) } }),
    ...(patch.mobileDiffReview === undefined
      ? {}
      : { mobileDiffReview: mobileDiffReviewValue(patch.mobileDiffReview) })
  }
}

function diffCommentValue(comment: NonNullable<WorktreeSetPatch['diffComments']>[number]) {
  return {
    id: comment.id,
    worktreeId: comment.worktreeId,
    filePath: comment.filePath,
    ...(comment.source === undefined ? {} : { source: comment.source }),
    ...(comment.selectedText === undefined ? {} : { selectedText: comment.selectedText }),
    ...(comment.startLine === undefined ? {} : { startLine: comment.startLine }),
    lineNumber: comment.lineNumber,
    body: comment.body,
    createdAt: comment.createdAt,
    ...(comment.updatedAt === undefined ? {} : { updatedAt: comment.updatedAt }),
    ...(comment.sentAt === undefined ? {} : { sentAt: comment.sentAt }),
    ...(comment.scope === undefined ? {} : { scope: comment.scope }),
    ...(comment.oldPath === undefined ? {} : { oldPath: comment.oldPath }),
    ...(comment.diffIdentity === undefined ? {} : { diffIdentity: comment.diffIdentity }),
    side: comment.side
  }
}

function mobileDiffReviewValue(review: NonNullable<WorktreeSetPatch['mobileDiffReview']>) {
  return {
    version: review.version,
    ...(review.updatedAt === undefined ? {} : { updatedAt: review.updatedAt }),
    ...(review.completedAt === undefined ? {} : { completedAt: review.completedAt }),
    files: Object.fromEntries(
      Object.entries(review.files).map(([key, file]) => [
        key,
        {
          key: file.key,
          filePath: file.filePath,
          ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
          scope: file.scope,
          ...(file.lastOpenedAt === undefined ? {} : { lastOpenedAt: file.lastOpenedAt }),
          ...(file.lastSeenDiffIdentity === undefined
            ? {}
            : { lastSeenDiffIdentity: file.lastSeenDiffIdentity }),
          ...(file.reviewedAt === undefined ? {} : { reviewedAt: file.reviewedAt }),
          ...(file.reviewDiffIdentity === undefined
            ? {}
            : { reviewDiffIdentity: file.reviewDiffIdentity })
        }
      ])
    )
  }
}

function revision(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Worktree linked PR must be a nonnegative safe integer')
  }
  return BigInt(value)
}

function oneOfEnum<const T extends string>(
  value: number,
  mapping: Partial<Record<number, T>>,
  label: string
): T {
  const mapped = mapping[value]
  if (mapped === undefined) {
    throw new TypeError(`${label} is invalid`)
  }
  return mapped
}

function safeInteger(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new TypeError('Worktree response integer is unsafe')
  }
  return number
}

function required(value: string, label: string): string {
  if (!value) {
    throw new TypeError(`${label} is missing`)
  }
  return value
}
