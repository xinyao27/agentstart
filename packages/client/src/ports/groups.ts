import type { WorkspacePort, WorkspacePortScanResult } from '@agentstart/protocol'

export type WorkspacePortGroup = {
  worktreeId: string
  repoId: string
  displayName: string
  ports: WorkspacePort[]
}

const workspaceGroupsCache = new WeakMap<WorkspacePortScanResult, WorkspacePortGroup[]>()
const externalPortsCache = new WeakMap<WorkspacePortScanResult, WorkspacePort[]>()
const EMPTY_WORKSPACE_PORT_GROUPS: WorkspacePortGroup[] = []
const EMPTY_EXTERNAL_PORTS: WorkspacePort[] = []

function comparePorts(a: WorkspacePort, b: WorkspacePort): number {
  return a.port - b.port || (a.processName ?? '').localeCompare(b.processName ?? '')
}

export function getWorkspacePortGroups(
  scan: WorkspacePortScanResult | null | undefined
): WorkspacePortGroup[] {
  if (!scan) {
    return EMPTY_WORKSPACE_PORT_GROUPS
  }
  const cached = workspaceGroupsCache.get(scan)
  if (cached) {
    return cached
  }
  const groupsByWorktreeId = new Map<string, WorkspacePortGroup>()
  for (const port of scan.ports) {
    if (port.kind !== 'workspace') {
      continue
    }
    const current = groupsByWorktreeId.get(port.owner.worktreeId)
    if (current) {
      current.ports.push(port)
    } else {
      groupsByWorktreeId.set(port.owner.worktreeId, {
        worktreeId: port.owner.worktreeId,
        repoId: port.owner.repoId,
        displayName: port.owner.displayName,
        ports: [port]
      })
    }
  }
  const groups = [...groupsByWorktreeId.values()]
    .map((group) => ({ ...group, ports: [...group.ports].sort(comparePorts) }))
    .sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) ||
        (a.ports[0]?.port ?? 0) - (b.ports[0]?.port ?? 0)
    )
  workspaceGroupsCache.set(scan, groups)
  return groups
}

export function getExternalWorkspacePorts(
  scan: WorkspacePortScanResult | null | undefined
): WorkspacePort[] {
  if (!scan) {
    return EMPTY_EXTERNAL_PORTS
  }
  const cached = externalPortsCache.get(scan)
  if (cached) {
    return cached
  }
  const ports = scan.ports.filter((port) => port.kind !== 'workspace').sort(comparePorts)
  externalPortsCache.set(scan, ports)
  return ports
}
