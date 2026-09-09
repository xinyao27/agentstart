import type { GitHubWorkItem } from '@yiru/protocol/hosted-review/review-types'
import type { ProjectSourceContext } from '@yiru/protocol/project/source-context'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'

import { getGitHubRuntimeRepoId, getGitHubSourceRuntimeTarget } from './source-runtime-context'

async function requireGitHubClient() {
  const client = await openGitHubTarget()
  if (!client) {
    throw new Error('GitHub protocol capability is unavailable')
  }
  return client
}

type GitHubWorkItemLookupArgs = {
  repoPath: string
  repoId: string
  sourceContext?: ProjectSourceContext | null
  number: number
  type?: 'pr'
}

type GitHubWorkItemByOwnerRepoLookupArgs = GitHubWorkItemLookupArgs & {
  owner: string
  repo: string
  type: 'pr'
}

function runtimeRepoId(args: Pick<GitHubWorkItemLookupArgs, 'repoId' | 'sourceContext'>): string {
  return getGitHubRuntimeRepoId(args.sourceContext, args.repoId)
}

export async function lookupGitHubWorkItemForSource(
  args: GitHubWorkItemLookupArgs
): Promise<GitHubWorkItem | null> {
  const target = getGitHubSourceRuntimeTarget(args.sourceContext)
  const client = await requireGitHubClient()
  const item = await client.getWorkItem(runtimeRepoId(args), args.number, {
    timeoutMs: 30_000,
    ...runtimeCallDestination(target)
  })
  return item ? ({ ...item, repoId: args.repoId } as GitHubWorkItem) : null
}

export async function lookupGitHubWorkItemByOwnerRepoForSource(
  args: GitHubWorkItemByOwnerRepoLookupArgs
): Promise<GitHubWorkItem | null> {
  const target = getGitHubSourceRuntimeTarget(args.sourceContext)
  const client = await requireGitHubClient()
  const item = await client.getWorkItemByOwnerRepo(
    runtimeRepoId(args),
    args.number,
    { owner: args.owner, repo: args.repo },
    { timeoutMs: 30_000, ...runtimeCallDestination(target) }
  )
  return item ? ({ ...item, repoId: args.repoId } as GitHubWorkItem) : null
}
