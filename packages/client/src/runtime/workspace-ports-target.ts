import { queryOptions } from '@tanstack/react-query'
import {
  WORKSPACE_PORTS_PROTOCOL_CAPABILITY,
  WorkspacePortsClient,
  type WorkspacePortKillResult,
  type WorkspacePortScanResult
} from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import { targetKey } from './query-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function openWorkspacePortsTarget(
  target: RuntimeClientTarget
): Promise<WorkspacePortsClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(WORKSPACE_PORTS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new WorkspacePortsClient(await openRuntimeProtocolTarget(target))
}

// Why: the ports namespace is protobuf-only, so a missing capability means the
// connected daemon predates the cutover — an error, not a legacy retry.
export async function requireWorkspacePortsClient(
  target: RuntimeClientTarget
): Promise<WorkspacePortsClient> {
  const client = await openWorkspacePortsTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.workspacePortsTarget.unavailable',
        'Workspace ports need a current Yiru daemon connection.'
      )
    )
  }
  return client
}

export async function scanWorkspacePorts(
  target: RuntimeClientTarget,
  repoId?: string,
  timeoutMs = 15_000
): Promise<WorkspacePortScanResult> {
  return (await requireWorkspacePortsClient(target)).scan(repoId, { timeoutMs })
}

export async function killWorkspacePort(
  target: RuntimeClientTarget,
  args: { repoId: string; pid: number; port: number },
  timeoutMs = 15_000
): Promise<WorkspacePortKillResult> {
  return (await requireWorkspacePortsClient(target)).kill(args, { timeoutMs })
}

// Why: Reads and invalidations must use the same execution-target scope.
export function workspacePortsScanQuery(target: RuntimeClientTarget) {
  return queryOptions({
    queryKey: ['workspace-ports', targetKey(target)] as const,
    queryFn: () => scanWorkspacePorts(target)
  })
}
