import type { ProjectExecutionRuntimeResolution } from '@agentstart/protocol/project/runtime-preference'
import { CLIENT_PLATFORM } from '~renderer/new-workspace/workspace-creation'

// Why: this used to branch on repo.connectionId (SSH vs. local), but
// Repo.connectionId is dead — nothing sets it since remote hosts were removed
// (#63) — so a repo's launch platform is always resolved from the local
// client / project runtime, never from the repo's path on a remote host.
export function getAgentLaunchPlatformForRepo(
  projectRuntime?: ProjectExecutionRuntimeResolution
): NodeJS.Platform {
  if (projectRuntime?.status === 'repair-required') {
    return projectRuntime.repair.preferredRuntime.kind === 'wsl' ? 'linux' : CLIENT_PLATFORM
  }
  if (projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl') {
    return 'linux'
  }
  return CLIENT_PLATFORM
}
