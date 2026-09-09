import { requireSessionTabsClient } from '../session-tabs-target'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import { createRemoteSessionTerminalCommand } from './commands'
import {
  applyFreshRemoteSessionTabsSnapshot,
  applyFreshRemoteSessionTabsSnapshots,
  applyRemoteSessionTabsStorePatch
} from './tabs-application'
import {
  registerRemoteSessionTabsRefreshHandler,
  requestRemoteSessionTabsRefresh,
  type RemoteSessionTabsRefreshRequest
} from './tabs-refresh-requests'

async function refreshRequestedRemoteSessionTabs(
  request: RemoteSessionTabsRefreshRequest
): Promise<void> {
  try {
    const snapshot = await requireSessionTabsClient({
      kind: 'environment',
      environmentId: request.environmentId
    }).then((client) =>
      client.list(toRuntimeWorktreeSelector(request.worktreeId), { timeoutMs: 15_000 })
    )
    applyRemoteSessionTabsStorePatch((state) =>
      applyFreshRemoteSessionTabsSnapshot(state, snapshot, request.environmentId)
    )
  } catch (error) {
    // Why: the host command already succeeded; the live subscription remains
    // authoritative if this eager parity refresh cannot complete.
    console.warn(
      '[remote-session-tabs-sync] failed to refresh session tabs:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

// Why: command refreshes must work before React effects and across remounts;
// this runtime module is imported once by the renderer bootstrap.
registerRemoteSessionTabsRefreshHandler(refreshRequestedRemoteSessionTabs)

export async function createAndRefreshRemoteSessionTerminal(args: {
  environmentId: string
  worktreeId: string
}): Promise<boolean> {
  const result = await createRemoteSessionTerminalCommand({ ...args, activate: true })
  if (result.status === 'failed') {
    console.warn(
      '[remote-session-tabs-sync] failed to create terminal:',
      result.error instanceof Error ? result.error.message : String(result.error)
    )
    return false
  }
  await requestRemoteSessionTabsRefresh(args)
  return true
}

export function subscribeAllRemoteSessionTabs(
  environmentId: string,
  isDisposed: () => boolean,
  registerUnsubscribe: (unsubscribe: () => void) => void
): void {
  const controller = new AbortController()
  registerUnsubscribe(() => controller.abort())
  void (async () => {
    let cancel: ((reason?: string) => Promise<void>) | null = null
    try {
      const client = await requireSessionTabsClient({ kind: 'environment', environmentId })
      const stream = await client.subscribeAll({ signal: controller.signal })
      cancel = stream.cancel
      for await (const event of stream.events) {
        if (isDisposed() || controller.signal.aborted) {
          return
        }
        if (event.type === 'snapshots') {
          applyRemoteSessionTabsStorePatch((state) =>
            applyFreshRemoteSessionTabsSnapshots(state, event.snapshots, environmentId)
          )
        } else if (event.type === 'updated') {
          applyRemoteSessionTabsStorePatch((state) =>
            applyFreshRemoteSessionTabsSnapshot(state, event, environmentId)
          )
        }
      }
    } catch (error) {
      if (!isDisposed() && !controller.signal.aborted) {
        console.warn(
          '[remote-session-tabs-sync] global subscription error:',
          error instanceof Error ? error.message : String(error)
        )
      }
    } finally {
      await cancel?.('remote session tabs global subscription closed')
    }
  })()
}
