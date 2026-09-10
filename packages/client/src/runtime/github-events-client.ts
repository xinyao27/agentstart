import type { GitHubEvent } from '@agentstart/protocol'
type RuntimeGitHubWorkItemMutatedEvent = {
  repoPath: string
  repoId?: string
  type: 'pr'
  number: number
}
import { getRepoExecutionHostId, parseExecutionHostId } from '@agentstart/protocol/host/identity'
import type { GitHubPRRefreshEvent } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { Repo } from '@agentstart/protocol/project/repository'

import { runtimeCallDestination } from './github-runtime-destination'
import { openGitHubTarget } from './github-target'
import type { RuntimeClientTarget } from './runtime-target'

function githubEventTarget(repo: Repo): RuntimeClientTarget {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  return host?.kind === 'runtime'
    ? { kind: 'environment', environmentId: host.environmentId }
    : { kind: 'local' }
}

function subscribeGitHubEvents(
  target: RuntimeClientTarget,
  onEvent: (event: GitHubEvent) => void
): () => void {
  const controller = new AbortController()
  void (async () => {
    try {
      const client = await openGitHubTarget()
      if (!client) {
        return
      }
      // Why: while the target opens, the owning surface can unmount (StrictMode
      // remount, dependency churn); opening then only cancels on the next tick.
      if (controller.signal.aborted) {
        return
      }
      const stream = await client.subscribeEvents({
        signal: controller.signal,
        ...runtimeCallDestination(target)
      })
      for await (const event of stream) {
        if (controller.signal.aborted) {
          return
        }
        onEvent(event)
      }
    } catch {
      // Why: aborting the owning surface must stay as quiet as the old IPC
      // unsubscribe path; connection failures are retried by its next mount.
    }
  })()
  return () => controller.abort()
}

export function subscribeGitHubPrRefreshEvents(
  onRefresh: (event: GitHubPRRefreshEvent) => void
): () => void {
  return subscribeGitHubEvents({ kind: 'local' }, (event) => {
    if (event.type === 'prRefresh') {
      // Why: the protobuf decoder passes skippedReason through as a plain
      // string, but the daemon only ever sends the values the workbench
      // union names — the stream type just cannot express that narrowing.
      onRefresh(event.event as GitHubPRRefreshEvent)
    }
  })
}

export function subscribeGitHubWorkItemMutations(
  repo: Repo,
  onMutated: (event: RuntimeGitHubWorkItemMutatedEvent) => void
): () => void {
  return subscribeGitHubEvents(githubEventTarget(repo), (event) => {
    if (event.type === 'workItemMutated') {
      // Why: the protobuf event has no `type` discriminant and carries repoId
      // as a plain string without presence, so an empty value maps back to the
      // contract's absent repoId instead of comparing as an id.
      onMutated({
        repoPath: event.item.repoPath,
        ...(event.item.repoId ? { repoId: event.item.repoId } : {}),
        type: 'pr',
        number: event.item.number
      })
    }
  })
}
