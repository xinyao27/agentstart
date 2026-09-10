import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { ProjectExecutionRuntimeResolution } from '@agentstart/protocol/project/runtime-preference'

export type SkillDiscoveryTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null

  cwd?: string | null

  worktreeId?: string | null

  executionHostId?: ExecutionHostId | null
  projectRuntime?: ProjectExecutionRuntimeResolution
}
