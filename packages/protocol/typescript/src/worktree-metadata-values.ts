import type {
  WorktreeDiffComment as ProtocolDiffComment,
  WorktreeLineage as ProtocolLineage,
  WorktreeLineageCapture as ProtocolLineageCapture,
  WorktreeMobileDiffReview as ProtocolMobileDiffReview,
  WorktreeMobileDiffReviewFile as ProtocolMobileDiffReviewFile,
  WorktreeWorkspaceLineage as ProtocolWorkspaceLineage
} from '../generated/agent_start/runtime/v1/worktree_pb.js'
import { nullableString } from './worktree-record-values.js'
import type {
  WorktreeDiffComment,
  WorktreeLineage,
  WorktreeLineageCapture,
  WorktreeMobileDiffReviewFile,
  WorktreeValue,
  WorktreeWorkspaceLineage
} from './worktree-types.js'

export function lineageValue(value: ProtocolLineage): WorktreeLineage {
  return {
    worktreeId: required(value.worktreeId, 'Lineage worktree ID'),
    worktreeInstanceId: required(value.worktreeInstanceId, 'Lineage worktree instance ID'),
    parentWorktreeId: required(value.parentWorktreeId, 'Lineage parent worktree ID'),
    parentWorktreeInstanceId: required(
      value.parentWorktreeInstanceId,
      'Lineage parent worktree instance ID'
    ),
    origin: oneOf(value.origin, ['orchestration', 'cli', 'manual']),
    capture: capture(requiredValue(value.capture, 'Lineage capture')),
    ...(value.orchestrationRunId === undefined
      ? {}
      : { orchestrationRunId: value.orchestrationRunId }),
    ...(value.taskId === undefined ? {} : { taskId: value.taskId }),
    ...(value.coordinatorHandle === undefined
      ? {}
      : { coordinatorHandle: value.coordinatorHandle }),
    ...(value.createdByTerminalHandle === undefined
      ? {}
      : { createdByTerminalHandle: value.createdByTerminalHandle }),
    createdAt: finite(value.createdAt, 'Lineage creation timestamp')
  }
}

export function workspaceLineageValue(value: ProtocolWorkspaceLineage): WorktreeWorkspaceLineage {
  return {
    childWorkspaceKey: workspaceKey(value.childWorkspaceKey),
    ...(value.childInstanceId === undefined
      ? {}
      : { childInstanceId: nullableString(value.childInstanceId) }),
    parentWorkspaceKey: workspaceKey(value.parentWorkspaceKey),
    ...(value.parentInstanceId === undefined
      ? {}
      : { parentInstanceId: nullableString(value.parentInstanceId) }),
    origin: oneOf(value.origin, ['orchestration', 'cli', 'manual']),
    capture: capture(requiredValue(value.capture, 'Workspace lineage capture')),
    ...(value.taskId === undefined ? {} : { taskId: value.taskId }),
    ...(value.orchestrationRunId === undefined
      ? {}
      : { orchestrationRunId: value.orchestrationRunId }),
    ...(value.coordinatorHandle === undefined
      ? {}
      : { coordinatorHandle: value.coordinatorHandle }),
    ...(value.createdByTerminalHandle === undefined
      ? {}
      : { createdByTerminalHandle: value.createdByTerminalHandle }),
    createdAt: finite(value.createdAt, 'Workspace lineage creation timestamp')
  }
}

function capture(value: ProtocolLineageCapture): WorktreeLineageCapture {
  const sources = [
    'explicit-cli-flag',
    'env-workspace',
    'cwd-context',
    'terminal-context',
    'orchestration-context',
    'active-workspace',
    'manual-action'
  ] satisfies readonly WorktreeLineageCapture['source'][]
  const source = sources.find((candidate) => candidate === value.source)
  if (!source || (value.confidence !== 'explicit' && value.confidence !== 'inferred')) {
    throw new TypeError('Worktree lineage capture is invalid')
  }
  return { source, confidence: value.confidence }
}

export function diffComment(value: ProtocolDiffComment): WorktreeDiffComment {
  const source = value.source === undefined ? undefined : oneOf(value.source, ['diff', 'markdown'])
  const scope =
    value.scope === undefined ? undefined : oneOf(value.scope, ['unstaged', 'staged', 'branch'])
  if (value.side !== 'modified') {
    throw new TypeError('Diff comment side is invalid')
  }
  return {
    id: required(value.id, 'Diff comment ID'),
    worktreeId: required(value.worktreeId, 'Diff comment worktree ID'),
    filePath: required(value.filePath, 'Diff comment path'),
    ...(source ? { source } : {}),
    ...(value.selectedText === undefined ? {} : { selectedText: value.selectedText }),
    ...(value.startLine === undefined
      ? {}
      : { startLine: finite(value.startLine, 'Diff start line') }),
    lineNumber: finite(requiredValue(value.lineNumber, 'Diff line number'), 'Diff line number'),
    body: value.body,
    createdAt: finite(value.createdAt, 'Diff comment creation timestamp'),
    ...(value.updatedAt === undefined
      ? {}
      : { updatedAt: finite(value.updatedAt, 'Diff update timestamp') }),
    ...(value.sentAt === undefined ? {} : { sentAt: finite(value.sentAt, 'Diff sent timestamp') }),
    ...(scope ? { scope } : {}),
    ...(value.oldPath === undefined ? {} : { oldPath: value.oldPath }),
    ...(value.diffIdentity === undefined ? {} : { diffIdentity: value.diffIdentity }),
    side: 'modified'
  }
}

export function mobileDiffReview(
  value: ProtocolMobileDiffReview
): WorktreeValue['mobileDiffReview'] {
  if (value.version !== 1) {
    throw new TypeError('Mobile diff review version is invalid')
  }
  return {
    version: 1,
    ...(value.updatedAt === undefined
      ? {}
      : { updatedAt: finite(value.updatedAt, 'Review update timestamp') }),
    ...(value.completedAt === undefined
      ? {}
      : { completedAt: finite(value.completedAt, 'Review completion timestamp') }),
    files: Object.fromEntries(
      Object.entries(value.files).map(([key, file]) => [key, reviewFile(file)])
    )
  }
}

function reviewFile(value: ProtocolMobileDiffReviewFile): WorktreeMobileDiffReviewFile {
  return {
    key: required(value.key, 'Review file key'),
    filePath: required(value.filePath, 'Review file path'),
    ...(value.oldPath === undefined ? {} : { oldPath: value.oldPath }),
    scope: oneOf(value.scope, ['unstaged', 'staged', 'branch']),
    ...(value.lastOpenedAt === undefined
      ? {}
      : { lastOpenedAt: finite(value.lastOpenedAt, 'Review opened timestamp') }),
    ...(value.lastSeenDiffIdentity === undefined
      ? {}
      : { lastSeenDiffIdentity: value.lastSeenDiffIdentity }),
    ...(value.reviewedAt === undefined
      ? {}
      : { reviewedAt: finite(value.reviewedAt, 'Review timestamp') }),
    ...(value.reviewDiffIdentity === undefined
      ? {}
      : { reviewDiffIdentity: value.reviewDiffIdentity })
  }
}

function workspaceKey(value: string): WorktreeWorkspaceLineage['childWorkspaceKey'] {
  if (isWorkspaceKey(value)) {
    return value
  }
  throw new TypeError('Workspace lineage key is invalid')
}

function isWorkspaceKey(value: string): value is WorktreeWorkspaceLineage['childWorkspaceKey'] {
  return /^(?:worktree|folder):.+$/.test(value)
}

function oneOf<const T extends string>(value: string, values: readonly T[]): T {
  const found = values.find((candidate) => candidate === value)
  if (!found) {
    throw new TypeError(`Unknown protocol value: ${value}`)
  }
  return found
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} is not finite`)
  }
  return value
}

function required(value: string, label: string): string {
  if (!value) {
    throw new TypeError(`${label} is missing`)
  }
  return value
}

function requiredValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new TypeError(`${label} is missing`)
  }
  return value
}
