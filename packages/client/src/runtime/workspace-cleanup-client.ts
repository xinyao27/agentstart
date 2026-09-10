import {
  WORKSPACE_CLEANUP_PROTOCOL_CAPABILITY,
  WorkspaceCleanupClient,
  type WorkspaceCleanupDismissal,
  type WorkspaceCleanupScanArgs,
  type WorkspaceCleanupScanProgress,
  type WorkspaceCleanupScanResult
} from '@agentstart/protocol'
import { useAppStore } from '~renderer/store/state'

import { openRuntimeProtocolTarget } from './protocol-target'
import { getActiveRuntimeTarget, type RuntimeClientTarget } from './rpc-client'
import { readRuntimeStatus } from './status-client'

async function openWorkspaceCleanupTarget(
  target: RuntimeClientTarget
): Promise<WorkspaceCleanupClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(WORKSPACE_CLEANUP_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new WorkspaceCleanupClient(await openRuntimeProtocolTarget(target))
}

// Why: the cleanup namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
async function requireWorkspaceCleanupClient(
  target: RuntimeClientTarget
): Promise<WorkspaceCleanupClient> {
  const client = await openWorkspaceCleanupTarget(target)
  if (!client) {
    throw new Error('workspaceCleanup.protobuf.v1 capability is not available')
  }
  return client
}

function activeWorkspaceCleanupTarget(): RuntimeClientTarget {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

// Why: scan progress is per-scanId, not host-wide — the caller passes its own
// scanId and callback, this just owns the stream's lifecycle, dropping the
// ready envelope and skipping progress from other scans.
async function subscribeToWorkspaceCleanupScanProgress(
  target: RuntimeClientTarget,
  scanId: string,
  onProgress: (progress: WorkspaceCleanupScanProgress) => void
): Promise<() => void> {
  const abort = new AbortController()
  try {
    const client = await openWorkspaceCleanupTarget(target)
    if (!client) {
      return () => {}
    }
    const subscription = await client.subscribeEvents({ signal: abort.signal })
    void (async () => {
      try {
        for await (const event of subscription.events) {
          if (event.type === 'progress' && event.progress.scanId === scanId) {
            onProgress(event.progress)
          }
        }
      } catch {
        // Why: the scan RPC call resolves/rejects on its own — a dropped
        // progress stream just means fewer ticks, not a failed scan.
      } finally {
        await subscription.cancel('scan finished').catch(() => {})
      }
    })()
    return () => abort.abort()
  } catch (err) {
    console.error('Failed to subscribe to workspace cleanup scan progress:', err)
    return () => {}
  }
}

export async function scanWorkspaceCleanup(
  args?: WorkspaceCleanupScanArgs,
  onProgress?: (progress: WorkspaceCleanupScanProgress) => void
): Promise<WorkspaceCleanupScanResult> {
  const target = activeWorkspaceCleanupTarget()
  const client = await requireWorkspaceCleanupClient(target)
  if (!onProgress) {
    return client.scan(args ?? {})
  }
  const scanId = args?.scanId ?? crypto.randomUUID()
  const unsubscribe = await subscribeToWorkspaceCleanupScanProgress(target, scanId, onProgress)
  try {
    return await client.scan({ ...args, scanId })
  } finally {
    unsubscribe()
  }
}

export async function dismissWorkspaceCleanupCandidates(
  dismissals: readonly WorkspaceCleanupDismissal[]
): Promise<Record<string, WorkspaceCleanupDismissal>> {
  const client = await requireWorkspaceCleanupClient(activeWorkspaceCleanupTarget())
  return client.dismiss([...dismissals])
}

export async function clearWorkspaceCleanupDismissals(): Promise<
  Record<string, WorkspaceCleanupDismissal>
> {
  const client = await requireWorkspaceCleanupClient(activeWorkspaceCleanupTarget())
  return client.clearDismissals()
}
