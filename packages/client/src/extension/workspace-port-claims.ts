import type { WorkspacePortScanResult } from '@agentstart/protocol'

import { projectDisplayName } from './project-display-name'

export type WorkspacePortClaim = {
  displayName: string
  port: number
  projectId: string
  worktreeId: string
}

export function workspacePortClaims(
  scan: WorkspacePortScanResult,
  projects: readonly { displayName: string; id: string }[]
): WorkspacePortClaim[] {
  return scan.ports.flatMap((port) =>
    port.kind === 'workspace' &&
    ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(port.connectHost.toLowerCase())
      ? [
          {
            displayName: projectDisplayName(projects, port.owner.repoId, port.owner.displayName),
            port: port.port,
            projectId: port.owner.repoId,
            worktreeId: port.owner.worktreeId
          }
        ]
      : []
  )
}
