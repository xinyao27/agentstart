// Why: local and routed runtime diagnostics share the same strict domain conversion.
import type {
  AppMemory as ProtocolAppMemory,
  GetMemorySnapshotResponse,
  HostMemory as ProtocolHostMemory,
  SessionMemory as ProtocolSessionMemory,
  UsageValues as ProtocolUsageValues,
  WorktreeMemory as ProtocolWorktreeMemory
} from '@agentstart/protocol'
import type {
  AppMemory,
  HostMemory,
  MemorySnapshot,
  SessionMemory,
  UsageValues,
  WorktreeMemory
} from '@agentstart/protocol/diagnostics/memory-values'
import { translate } from '~renderer/i18n/i18n'

export function mapProtocolMemorySnapshot(snapshot: GetMemorySnapshotResponse): MemorySnapshot {
  return {
    app: mapApp(required(snapshot.app, 'app')),
    worktrees: snapshot.worktrees.map(mapWorktree),
    host: mapHost(required(snapshot.host, 'host')),
    totalCpu: finiteNonnegative(snapshot.totalCpu, 'total_cpu'),
    totalMemory: safeUint64(snapshot.totalMemory, 'total_memory'),
    collectedAt: safeUint64(snapshot.collectedAt, 'collected_at')
  }
}

function mapUsage(usage: ProtocolUsageValues, field: string): UsageValues {
  return {
    cpu: finiteNonnegative(usage.cpu, `${field}.cpu`),
    memory: safeUint64(usage.memory, `${field}.memory`)
  }
}

function mapApp(app: ProtocolAppMemory): AppMemory {
  return {
    cpu: finiteNonnegative(app.cpu, 'app.cpu'),
    memory: safeUint64(app.memory, 'app.memory'),
    daemon: mapUsage(required(app.daemon, 'app.daemon'), 'app.daemon'),
    other: mapUsage(required(app.other, 'app.other'), 'app.other'),
    history: app.history.map((value) => safeUint64(value, 'app.history'))
  }
}

function mapSession(session: ProtocolSessionMemory): SessionMemory {
  return {
    cpu: finiteNonnegative(session.cpu, 'worktree.sessions.cpu'),
    memory: safeUint64(session.memory, 'worktree.sessions.memory'),
    sessionId: session.sessionId,
    paneKey: session.paneKey ?? null,
    pid: session.pid
  }
}

function mapWorktree(worktree: ProtocolWorktreeMemory): WorktreeMemory {
  return {
    cpu: finiteNonnegative(worktree.cpu, 'worktree.cpu'),
    memory: safeUint64(worktree.memory, 'worktree.memory'),
    worktreeId: worktree.worktreeId,
    worktreeName: worktree.worktreeName,
    repoId: worktree.repoId,
    repoName: worktree.repoName,
    sessions: worktree.sessions.map(mapSession),
    history: worktree.history.map((value) => safeUint64(value, 'worktree.history'))
  }
}

function mapHost(host: ProtocolHostMemory): HostMemory {
  return {
    totalMemory: safeUint64(host.totalMemory, 'host.total_memory'),
    freeMemory: safeUint64(host.freeMemory, 'host.free_memory'),
    usedMemory: safeUint64(host.usedMemory, 'host.used_memory'),
    memoryUsagePercent: finiteNonnegative(host.memoryUsagePercent, 'host.memory_usage_percent'),
    cpuCoreCount: host.cpuCoreCount,
    loadAverage1m: finiteNonnegative(host.loadAverage1m, 'host.load_average_1m')
  }
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(
      translate(
        'runtime.diagnostics.missing.field',
        'Runtime diagnostics response is missing {{field}}.',
        { field }
      )
    )
  }
  return value
}

function safeUint64(value: bigint, field: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(
      translate(
        'runtime.diagnostics.unsafe.integer',
        "Runtime diagnostics {{field}} exceeds JavaScript's safe integer range.",
        { field }
      )
    )
  }
  return number
}

function finiteNonnegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      translate('runtime.diagnostics.invalid.field', 'Runtime diagnostics {{field}} is invalid.', {
        field
      })
    )
  }
  return value
}
