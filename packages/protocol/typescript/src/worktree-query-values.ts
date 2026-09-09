import {
  WorktreeDetectedSource,
  WorktreeOwnership
} from '../generated/yiru/runtime/v1/worktree_pb.js'
import type {
  WorktreeDetectedRecord,
  WorktreeLinkedPullRequest,
  WorktreePsSummary as ProtocolPsSummary,
  WorktreeServiceDetectedListResponse,
  WorktreeServiceLineageListResponse,
  WorktreeServicePsResponse,
  WorktreeServiceShowResponse
} from '../generated/yiru/runtime/v1/worktree_pb.js'
import { lineageValue, workspaceLineageValue } from './worktree-metadata-values.js'
import type {
  WorktreeDetectedListResult,
  WorktreeDetectedWorktreeValue,
  WorktreeLineageListResult,
  WorktreePsResult,
  WorktreePsSummary,
  WorktreeShowResult
} from './worktree-operation-types.js'
import { worktreeValue } from './worktree-record-values.js'

export function worktreeShowResult(value: WorktreeServiceShowResponse): WorktreeShowResult {
  const output: WorktreeShowResult = {
    worktree: worktreeValue(requiredValue(value.worktree, 'Worktree'))
  }
  if (value.revision !== undefined) {
    output.revision = safeInteger(value.revision)
  }
  return output
}

export function worktreePsResult(value: WorktreeServicePsResponse): WorktreePsResult {
  return {
    worktrees: value.worktrees.map(psSummary),
    totalCount: value.totalCount,
    truncated: value.truncated
  }
}

function psSummary(value: ProtocolPsSummary): WorktreePsSummary {
  return {
    workspaceKind: value.workspaceKind,
    worktreeId: required(value.worktreeId, 'Worktree ID'),
    repoId: required(value.repoId, 'Worktree repository ID'),
    hostId: value.hostId,
    resumeTargetStatus: value.resumeTargetStatus,
    terminalPlatform: value.terminalPlatform,
    ...(value.priorWorktreeIds.length > 0 ? { priorWorktreeIds: value.priorWorktreeIds } : {}),
    repo: value.repo,
    path: value.path,
    branch: value.branch,
    displayName: value.displayName,
    workspaceStatus: value.workspaceStatus,
    isArchived: value.isArchived,
    isMainWorktree: value.isMainWorktree,
    hasHostSidebarActivity: value.hasHostSidebarActivity,
    ...(value.worktreeInstanceId === undefined
      ? {}
      : { worktreeInstanceId: value.worktreeInstanceId }),
    parentWorktreeId: value.parentWorktreeId ?? null,
    childWorktreeIds: value.childWorktreeIds,
    sortOrder: finite(value.sortOrder),
    ...(value.manualOrder === undefined ? {} : { manualOrder: finite(value.manualOrder) }),
    ...(value.lastActivityAt === undefined
      ? {}
      : { lastActivityAt: safeInteger(value.lastActivityAt) }),
    ...(value.createdAt === undefined ? {} : { createdAt: safeInteger(value.createdAt) }),
    linkedPR: value.linkedPr ? linkedPullRequest(value.linkedPr) : null,
    comment: value.comment,
    isPinned: value.isPinned,
    isActive: value.isActive,
    unread: value.unread,
    liveTerminalCount: value.liveTerminalCount,
    hasAttachedPty: value.hasAttachedPty,
    lastOutputAt: value.lastOutputAt === undefined ? null : safeInteger(value.lastOutputAt),
    preview: value.preview,
    status: value.status,
    agents: value.agents.map((agent) => ({
      paneKey: agent.paneKey,
      ...(agent.parentPaneKey === undefined ? {} : { parentPaneKey: agent.parentPaneKey }),
      state: agent.state,
      ...(agent.agentType === undefined ? {} : { agentType: agent.agentType }),
      prompt: agent.prompt,
      ...(agent.taskTitle === undefined ? {} : { taskTitle: agent.taskTitle }),
      ...(agent.displayName === undefined ? {} : { displayName: agent.displayName }),
      ...(agent.lastAssistantMessage === undefined
        ? {}
        : { lastAssistantMessage: agent.lastAssistantMessage }),
      ...(agent.toolName === undefined ? {} : { toolName: agent.toolName }),
      ...(agent.toolInput === undefined ? {} : { toolInput: agent.toolInput }),
      interrupted: agent.interrupted,
      stateStartedAt: safeInteger(agent.stateStartedAt),
      updatedAt: safeInteger(agent.updatedAt)
    }))
  }
}

function linkedPullRequest(value: WorktreeLinkedPullRequest): { number: number; state: string } {
  return { number: Number(value.number), state: value.state }
}

export function worktreeDetectedListResult(
  value: WorktreeServiceDetectedListResponse
): WorktreeDetectedListResult {
  const output: WorktreeDetectedListResult = {
    repoId: required(value.repoId, 'Detected worktree repository ID'),
    authoritative: value.authoritative,
    source: oneOfEnum(
      value.source,
      {
        [WorktreeDetectedSource.GIT]: 'git',
        [WorktreeDetectedSource.METADATA_FALLBACK]: 'metadata-fallback',
        [WorktreeDetectedSource.SESSION_FALLBACK]: 'session-fallback'
      } as const,
      'Detected worktree source'
    ),
    worktrees: value.worktrees.map(detectedRecord)
  }
  if (value.revision !== undefined) {
    output.revision = safeInteger(value.revision)
  }
  return output
}

function detectedRecord(value: WorktreeDetectedRecord): WorktreeDetectedWorktreeValue {
  return {
    ...worktreeValue(requiredValue(value.record, 'Detected worktree')),
    ownership: oneOfEnum(
      value.ownership,
      {
        [WorktreeOwnership.YIRU_MANAGED]: 'yiru-managed',
        [WorktreeOwnership.EXTERNAL]: 'external',
        [WorktreeOwnership.UNKNOWN_LEGACY]: 'unknown-legacy'
      } as const,
      'Detected worktree ownership'
    ),
    selectedCheckout: value.selectedCheckout,
    visible: value.visible
  }
}

export function worktreeLineageListResult(
  value: WorktreeServiceLineageListResponse
): WorktreeLineageListResult {
  return {
    lineage: Object.fromEntries(
      Object.entries(value.lineage).map(([id, entry]) => [id, lineageValue(entry)])
    ),
    workspaceLineage: Object.fromEntries(
      Object.entries(value.workspaceLineage).map(([id, entry]) => [
        id,
        workspaceLineageValue(entry)
      ])
    )
  }
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

function finite(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('Worktree response number is not finite')
  }
  return value
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

function requiredValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new TypeError(`${label} is missing`)
  }
  return value
}
