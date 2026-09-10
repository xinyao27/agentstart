import type {
  WorktreeArchive,
  WorktreeServiceCreateResponse
} from '../generated/agent_start/runtime/v1/worktree_pb.js'
import { lineageValue, workspaceLineageValue } from './worktree-metadata-values.js'
import { nullableString, worktreeValue } from './worktree-record-values.js'
import type { WorktreeArchiveValue, WorktreeCreateResult } from './worktree-types.js'

export function worktreeCreateResult(value: WorktreeServiceCreateResponse): WorktreeCreateResult {
  const output: WorktreeCreateResult = {
    worktree: worktreeValue(requiredValue(value.worktree, 'Created worktree'))
  }
  assign(output, 'revision', value.revision === undefined ? undefined : safeInteger(value.revision))
  assign(output, 'lineage', value.lineage && lineageValue(value.lineage))
  assign(
    output,
    'workspaceLineage',
    value.workspaceLineage && workspaceLineageValue(value.workspaceLineage)
  )
  if (value.warnings.length > 0) {
    output.warnings = value.warnings.map((warning) => ({
      code: oneOf(warning.code, [
        'LINEAGE_PARENT_CONTEXT_MISSING',
        'LINEAGE_PARENT_CONTEXT_CONFLICT',
        'LINEAGE_PARENT_INSTANCE_STALE'
      ]),
      message: warning.message,
      ...(Object.keys(warning.details).length > 0 ? { details: warning.details } : {})
    }))
  }
  assign(
    output,
    'setup',
    value.setup && {
      runnerScriptPath: required(value.setup.runnerScriptPath, 'Setup runner script path'),
      envVars: value.setup.envVars,
      ...(value.setup.command === undefined ? {} : { command: value.setup.command }),
      ...(value.setup.waitForAgentStartup === undefined
        ? {}
        : { waitForAgentStartup: value.setup.waitForAgentStartup })
    }
  )
  assign(
    output,
    'setupReceipt',
    value.setupReceipt && {
      requested: oneOf(value.setupReceipt.requested, ['run', 'skip', 'inherit']),
      hookFound: value.setupReceipt.hookFound,
      startupPolicy: oneOf(value.setupReceipt.startupPolicy, [
        'wait-for-setup',
        'start-immediately'
      ]),
      state: oneOf(value.setupReceipt.state, [
        'not_configured',
        'skipped',
        'running',
        'spawn_failed'
      ]),
      ...(value.setupReceipt.terminalHandle === undefined
        ? {}
        : { terminalHandle: value.setupReceipt.terminalHandle })
    }
  )
  assign(
    output,
    'defaultTabs',
    value.defaultTabs && {
      tabs: value.defaultTabs.tabs.map((tab) => ({
        ...(tab.title === undefined ? {} : { title: tab.title }),
        ...(tab.color === undefined ? {} : { color: tab.color }),
        ...(tab.command === undefined ? {} : { command: tab.command })
      })),
      runCommands: value.defaultTabs.runCommands
    }
  )
  assign(output, 'warning', value.warning)
  assign(
    output,
    'initialBaseStatus',
    value.initialBaseStatus && {
      repoId: required(value.initialBaseStatus.repoId, 'Base status repository ID'),
      worktreeId: required(value.initialBaseStatus.worktreeId, 'Base status worktree ID'),
      status: oneOf(value.initialBaseStatus.status, [
        'checking',
        'current',
        'drift',
        'base_changed',
        'unknown'
      ]),
      base: value.initialBaseStatus.base,
      ...(value.initialBaseStatus.remote === undefined
        ? {}
        : { remote: value.initialBaseStatus.remote }),
      ...(value.initialBaseStatus.behind === undefined
        ? {}
        : { behind: finite(value.initialBaseStatus.behind) }),
      ...(value.initialBaseStatus.recentSubjects.length === 0
        ? {}
        : { recentSubjects: value.initialBaseStatus.recentSubjects })
    }
  )
  assign(
    output,
    'localBaseRefRefresh',
    value.localBaseRefRefresh && {
      status: oneOf(value.localBaseRefRefresh.status, [
        'updated',
        'skipped_dirty_worktree',
        'skipped_not_fast_forward',
        'skipped_error'
      ]),
      baseRef: value.localBaseRefRefresh.baseRef,
      localBranch: value.localBaseRefRefresh.localBranch,
      ...(value.localBaseRefRefresh.ownerWorktreePath === undefined
        ? {}
        : { ownerWorktreePath: value.localBaseRefRefresh.ownerWorktreePath })
    }
  )
  assign(
    output,
    'localBaseRefUpdateSuggestion',
    value.localBaseRefUpdateSuggestion && {
      baseRef: value.localBaseRefUpdateSuggestion.baseRef,
      localBranch: value.localBaseRefUpdateSuggestion.localBranch,
      behind: finite(value.localBaseRefUpdateSuggestion.behind)
    }
  )
  assign(
    output,
    'startupTerminal',
    value.startupTerminal && {
      spawned: value.startupTerminal.spawned,
      ...(value.startupTerminal.handle === undefined
        ? {}
        : { handle: value.startupTerminal.handle }),
      ...(value.startupTerminal.tabId === undefined ? {} : { tabId: value.startupTerminal.tabId }),
      ...(value.startupTerminal.paneKey === undefined
        ? {}
        : { paneKey: nullableString(value.startupTerminal.paneKey) }),
      ...(value.startupTerminal.ptyId === undefined
        ? {}
        : { ptyId: nullableString(value.startupTerminal.ptyId) }),
      ...(value.startupTerminal.surface === undefined
        ? {}
        : { surface: oneOf(value.startupTerminal.surface, ['visible', 'background']) })
    }
  )
  assign(
    output,
    'timing',
    value.timing && {
      totalDurationMs: finite(value.timing.totalDurationMs),
      phases: value.timing.phases.map((phase) => ({
        phase: phase.phase,
        startedAtMs: finite(phase.startedAtMs),
        durationMs: finite(phase.durationMs)
      }))
    }
  )
  assign(output, 'agentTerminalHandle', value.agentTerminalHandle)
  return output
}

export function worktreeArchiveValue(value: WorktreeArchive): WorktreeArchiveValue {
  return {
    branch: value.branch,
    createdAt: safeInteger(value.createdAt),
    failureDetail: value.failureDetail ? nullableString(value.failureDetail) : null,
    head: value.head,
    id: required(value.id, 'Worktree archive ID'),
    originalWorktreeId: required(value.originalWorktreeId, 'Archived worktree ID'),
    path: required(value.path, 'Archived worktree path'),
    repoId: required(value.repoId, 'Archive repository ID'),
    restoredAt: value.restoredAt === undefined ? null : safeInteger(value.restoredAt),
    stashOid: value.stashOid ?? null,
    status: oneOf(value.status, ['archiving', 'archived', 'failed', 'restored'])
  }
}

function assign<K extends keyof WorktreeCreateResult>(
  output: WorktreeCreateResult,
  key: K,
  value: WorktreeCreateResult[K] | undefined
): void {
  if (value !== undefined) {
    output[key] = value
  }
}

function oneOf<const T extends string>(value: string, values: readonly T[]): T {
  const found = values.find((candidate) => candidate === value)
  if (!found) {
    throw new TypeError(`Unknown worktree protocol value: ${value}`)
  }
  return found
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
