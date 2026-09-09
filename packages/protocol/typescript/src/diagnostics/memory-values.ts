// Why: resource diagnostics use safe numeric byte counts after protobuf uint64 validation;
// CPU remains a percentage of one core and may exceed 100 across owned processes.
export type UsageValues = {
  cpu: number
  memory: number
}

export type AppMemory = UsageValues & {
  daemon: UsageValues
  other: UsageValues
  history: number[]
}

export type SessionMemory = UsageValues & {
  sessionId: string
  paneKey: string | null
  pid: number
}

export type WorktreeMemory = UsageValues & {
  worktreeId: string
  worktreeName: string
  repoId: string
  repoName: string
  sessions: SessionMemory[]
  history: number[]
}

export type HostMemory = {
  totalMemory: number
  freeMemory: number
  usedMemory: number
  memoryUsagePercent: number
  cpuCoreCount: number
  loadAverage1m: number
}

export type MemorySnapshot = {
  app: AppMemory
  worktrees: WorktreeMemory[]
  host: HostMemory
  totalCpu: number
  totalMemory: number
  collectedAt: number
}
