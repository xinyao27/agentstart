import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { workspacePortsScanQuery } from '~renderer/runtime/workspace-ports-target'

import { getExtensionBrowserCapabilities } from './browser-capabilities'
import { workspacePortClaims } from './workspace-port-claims'

const WORKSPACE_PORT_REFRESH_INTERVAL_MS = 5_000
const LOCAL_DAEMON_TARGET = { kind: 'local' } as const

export function WorkspacePortClaimsBridge(): null {
  const catalog = useProjectCatalog()
  const projects = catalog.repos.map((project) => ({
    displayName: project.displayName,
    id: project.id
  }))
  const workspacePorts = useQuery({
    ...workspacePortsScanQuery(LOCAL_DAEMON_TARGET),
    refetchInterval: WORKSPACE_PORT_REFRESH_INTERVAL_MS
  })
  useEffect(() => {
    if (workspacePorts.data) {
      void getExtensionBrowserCapabilities()
        .publishWorkspacePortClaims(workspacePortClaims(workspacePorts.data, projects))
        .catch((error: unknown) => console.error('Failed to publish workspace port claims:', error))
    }
  }, [projects, workspacePorts.data])
  return null
}
