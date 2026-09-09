import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/protocol/host/identity'
import type { GitHubPRMergeMethod, PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import type { Repo } from '@yiru/protocol/project/repository'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

type GitHubPRRepo = PRInfo['prRepo']

// Why: runtime-host projects mirror server paths into the desktop store, but
// desktop gh IPC only trusts local/SSH repo registrations.
function getGitHubActionTarget(repo: Repo): RuntimeClientTarget {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  return host?.kind === 'runtime'
    ? { kind: 'environment', environmentId: host.environmentId }
    : { kind: 'local' }
}

async function requireGitHubClient() {
  const client = await openGitHubTarget()
  if (!client) {
    throw new Error('GitHub protocol capability is unavailable')
  }
  return client
}

export async function mergeGitHubHostedReview(args: {
  repo: Repo
  prNumber: number
  method: GitHubPRMergeMethod
  prRepo?: GitHubPRRepo | null
}) {
  const target = getGitHubActionTarget(args.repo)
  const client = await requireGitHubClient()
  return client.mergePr(
    {
      repo: args.repo.id,
      prNumber: args.prNumber,
      method: args.method,
      prRepo: args.prRepo ?? undefined
    },
    { timeoutMs: 30_000, ...runtimeCallDestination(target) }
  )
}

export async function setGitHubHostedReviewAutoMerge(args: {
  repo: Repo
  prNumber: number
  enabled: boolean
  method?: GitHubPRMergeMethod
  prRepo?: GitHubPRRepo | null
}) {
  const target = getGitHubActionTarget(args.repo)
  const client = await requireGitHubClient()
  return client.setPrAutoMerge(
    {
      repo: args.repo.id,
      prNumber: args.prNumber,
      enabled: args.enabled,
      method: args.method,
      prRepo: args.prRepo ?? undefined
    },
    { timeoutMs: 30_000, ...runtimeCallDestination(target) }
  )
}

export async function updateGitHubHostedReviewState(args: {
  repo: Repo
  prNumber: number
  nextState: 'open' | 'closed'
}) {
  const target = getGitHubActionTarget(args.repo)
  const client = await requireGitHubClient()
  return client.updatePrState(args.repo.id, args.prNumber, args.nextState, {
    timeoutMs: 30_000,
    ...runtimeCallDestination(target)
  })
}
