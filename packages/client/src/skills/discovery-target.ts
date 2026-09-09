import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import type { ProjectExecutionRuntimeResolution } from '@yiru/protocol/project/runtime-preference'

export type SkillDiscoveryTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null

  cwd?: string | null

  worktreeId?: string | null

  executionHostId?: ExecutionHostId | null
  projectRuntime?: ProjectExecutionRuntimeResolution
}
