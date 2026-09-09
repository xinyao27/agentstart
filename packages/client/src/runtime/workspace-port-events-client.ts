import type { RuntimeClientTarget } from './runtime-target'
import { openWorkspacePortsTarget } from './workspace-ports-target'

// Why: a thin `for await` consumer scoped to one runtime target gives local
// and paired environments the same advertised-url feed through the ports
// protobuf stream. The ready envelope only marks the subscription as live;
// the caller just observes advertised-url changes until the stream ends.
export function subscribeWorkspacePortAdvertisedUrlChanges(
  target: RuntimeClientTarget,
  onChanged: (event: { worktreeId: string; port: number }) => void
): () => void {
  const controller = new AbortController()
  void (async () => {
    try {
      const client = await openWorkspacePortsTarget(target)
      if (!client) {
        return
      }
      // Why: while the target opens, the owning surface can unmount (StrictMode
      // remount, dependency churn); opening then only cancels on the next tick.
      if (controller.signal.aborted) {
        return
      }
      const subscription = await client.subscribeEvents({ signal: controller.signal })
      for await (const event of subscription.events) {
        if (controller.signal.aborted) {
          return
        }
        if (event.type === 'advertisedUrlChanged') {
          onChanged({ worktreeId: event.worktreeId, port: event.port })
        }
      }
    } catch {
      // Why: an aborted subscription (unmount, or a dropped transport that a
      // reconnect will replace) must not surface as an unhandled rejection.
    }
  })()
  return () => controller.abort()
}
