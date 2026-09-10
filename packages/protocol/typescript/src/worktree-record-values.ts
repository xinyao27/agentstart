import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type {
  WorktreeGitInfo as ProtocolGitInfo,
  WorktreeNullableInt64,
  WorktreeNullableString,
  WorktreeRecord
} from '../generated/agent_start/runtime/v1/worktree_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RepoAgentValue, RepoExecutionHostId } from './repo-types.js'
import {
  diffComment,
  lineageValue,
  mobileDiffReview,
  workspaceLineageValue
} from './worktree-metadata-values.js'
import type { WorktreeGitInfo, WorktreeValue } from './worktree-types.js'

const AGENTS = [
  'claude',
  'openclaude',
  'codex',
  'autohand',
  'opencode',
  'mimo-code',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'openclaw',
  'copilot',
  'grok',
  'devin',
  'ante',
  'trae'
] satisfies readonly RepoAgentValue[]

export function worktreeValue(value: WorktreeRecord): WorktreeValue {
  const git = gitValue(requiredValue(value.git, 'Worktree git state'))
  const output: WorktreeValue = {
    ...git,
    id: required(value.id, 'Worktree ID'),
    repoId: required(value.repoId, 'Worktree repository ID'),
    path: required(value.path, 'Worktree path'),
    head: value.head,
    branch: value.branch,
    isBare: value.isBare,
    isMainWorktree: value.isMainWorktree,
    displayName: required(value.displayName, 'Worktree display name'),
    comment: value.comment,
    linkedPR: value.linkedPr ? nullableInteger(value.linkedPr, 'Linked pull request') : null,
    isArchived: value.isArchived,
    isUnread: value.isUnread,
    isPinned: value.isPinned,
    sortOrder: finite(value.sortOrder, 'Worktree sort order'),
    lastActivityAt: finite(value.lastActivityAt, 'Worktree activity timestamp'),
    parentWorktreeId: value.parentWorktreeId ? nullableString(value.parentWorktreeId) : null,
    childWorktreeIds: value.childWorktreeIds,
    lineage: value.lineage ? lineageValue(value.lineage) : null,
    workspaceLineage: value.workspaceLineage ? workspaceLineageValue(value.workspaceLineage) : null,
    git
  }
  assign(output, 'instanceId', value.instanceId)
  assign(output, 'projectId', value.projectId)
  assign(output, 'hostId', value.hostId === undefined ? undefined : hostId(value.hostId))
  assign(output, 'projectHostSetupId', value.projectHostSetupId)
  assign(output, 'isSparse', value.isSparse)
  assign(output, 'locked', value.locked)
  assign(output, 'lockReason', value.lockReason)
  assign(output, 'prunable', value.prunable)
  assign(output, 'prunableReason', value.prunableReason)
  assign(output, 'manualOrder', optionalFinite(value.manualOrder, 'Worktree manual order'))
  assign(output, 'createdAt', optionalFinite(value.createdAt, 'Worktree creation timestamp'))
  assign(
    output,
    'createdWithAgent',
    value.createdWithAgent === undefined ? undefined : agent(value.createdWithAgent)
  )
  assign(output, 'pendingFirstAgentMessageRename', value.pendingFirstAgentMessageRename)
  assign(
    output,
    'firstAgentMessageRenameError',
    value.firstAgentMessageRenameError && nullableString(value.firstAgentMessageRenameError)
  )
  if (value.sparseDirectories.length > 0) {
    assign(output, 'sparseDirectories', value.sparseDirectories)
  }
  assign(output, 'sparseBaseRef', value.sparseBaseRef)
  assign(output, 'sparsePresetId', value.sparsePresetId)
  assign(output, 'baseRef', value.baseRef)
  assign(output, 'pushTarget', value.pushTarget && pushTarget(value.pushTarget))
  if (value.priorWorktreeIds.length > 0) {
    assign(output, 'priorWorktreeIds', value.priorWorktreeIds)
  }
  assign(output, 'workspaceStatus', value.workspaceStatus)
  if (value.diffComments.length > 0) {
    assign(output, 'diffComments', value.diffComments.map(diffComment))
  }
  assign(
    output,
    'mobileDiffReview',
    value.mobileDiffReview && mobileDiffReview(value.mobileDiffReview)
  )
  return output
}

function gitValue(value: ProtocolGitInfo): WorktreeGitInfo {
  return {
    path: required(value.path, 'Git worktree path'),
    head: value.head,
    branch: value.branch,
    isBare: value.isBare,
    ...(value.isSparse === undefined ? {} : { isSparse: value.isSparse }),
    ...(value.locked === undefined ? {} : { locked: value.locked }),
    ...(value.lockReason === undefined ? {} : { lockReason: value.lockReason }),
    ...(value.prunable === undefined ? {} : { prunable: value.prunable }),
    ...(value.prunableReason === undefined ? {} : { prunableReason: value.prunableReason }),
    isMainWorktree: value.isMainWorktree
  }
}

function pushTarget(value: NonNullable<WorktreeRecord['pushTarget']>) {
  return {
    remoteName: required(value.remoteName, 'Push target remote'),
    branchName: required(value.branchName, 'Push target branch'),
    ...(value.remoteUrl === undefined ? {} : { remoteUrl: value.remoteUrl }),
    ...(value.remoteCreated === undefined ? {} : { remoteCreated: value.remoteCreated })
  }
}

function nullableInteger(value: WorktreeNullableInt64, label: string): number | null {
  switch (value.value.case) {
    case 'number':
      return safeInteger(value.value.value, label)
    case 'null':
      return null
    case undefined:
      throw invalid(`${label} is missing`)
  }
}

export function nullableString(value: WorktreeNullableString): string | null {
  switch (value.value.case) {
    case 'text':
      return value.value.value
    case 'null':
      return null
    case undefined:
      throw invalid('Nullable string value is missing')
  }
}

function agent(value: string): RepoAgentValue {
  const found = AGENTS.find((candidate) => candidate === value)
  if (!found) {
    throw invalid('Worktree agent identity is invalid')
  }
  return found
}

function hostId(value: string): RepoExecutionHostId {
  if (isHostId(value)) {
    return value
  }
  throw invalid('Worktree host identity is invalid')
}

function isHostId(value: string): value is RepoExecutionHostId {
  return value === 'local' || /^(?:runtime|ssh|wsl):.+$/.test(value)
}

function assign<K extends keyof WorktreeValue>(
  output: WorktreeValue,
  key: K,
  value: WorktreeValue[K] | undefined
): void {
  if (value !== undefined) {
    output[key] = value
  }
}

function optionalFinite(value: number | undefined, label: string): number | undefined {
  return value === undefined ? undefined : finite(value, label)
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw invalid(`${label} is not finite`)
  }
  return value
}

function safeInteger(value: bigint, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw invalid(`${label} is outside the safe integer range`)
  }
  return number
}

function required(value: string, label: string): string {
  if (!value) {
    throw invalid(`${label} is missing`)
  }
  return value
}

function requiredValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw invalid(`${label} is missing`)
  }
  return value
}

function invalid(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
