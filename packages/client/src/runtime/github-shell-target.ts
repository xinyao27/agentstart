import {
  GitHubShellClient,
  type AppStarSource,
  type GitHubPrRefreshCandidate,
  type GitHubPrRefreshEnqueueResult,
  type GitHubPrRefreshReason,
  type GitHubViewer
} from '@yiru/protocol'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'

export type ShellGitHubApi = {
  viewer: () => Promise<GitHubViewer | null>
  enqueuePRRefresh: (args: {
    candidate: GitHubPrRefreshCandidate
    reason: GitHubPrRefreshReason
    priority?: number
  }) => Promise<GitHubPrRefreshEnqueueResult | false>
  reportVisiblePRRefreshCandidates: (args: {
    candidates: GitHubPrRefreshCandidate[]
    generation: number
  }) => Promise<boolean>
  checkYiruStarred: () => Promise<boolean | null>
  starYiru: (source: AppStarSource) => Promise<boolean>
}

export const shellGitHubApi: ShellGitHubApi = {
  viewer: async () => (await openGitHubShellTarget()).getViewer(),
  enqueuePRRefresh: async (input) => (await openGitHubShellTarget()).enqueuePrRefresh(input),
  reportVisiblePRRefreshCandidates: async (input) =>
    (await openGitHubShellTarget()).reportVisiblePrRefreshCandidates(input),
  checkYiruStarred: async () => (await openGitHubShellTarget()).checkYiruStarred(),
  starYiru: async (input) => (await openGitHubShellTarget()).starYiru(input)
}

async function openGitHubShellTarget(): Promise<GitHubShellClient> {
  return new GitHubShellClient(await openConfiguredBrowserHostProtocol())
}
