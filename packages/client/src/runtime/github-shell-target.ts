import {
  GitHubShellClient,
  type AppStarSource,
  type GitHubPrRefreshCandidate,
  type GitHubPrRefreshEnqueueResult,
  type GitHubPrRefreshReason,
  type GitHubViewer
} from '@agentstart/protocol'

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
  checkAgentStartStarred: () => Promise<boolean | null>
  starAgentStart: (source: AppStarSource) => Promise<boolean>
}

export const shellGitHubApi: ShellGitHubApi = {
  viewer: async () => (await openGitHubShellTarget()).getViewer(),
  enqueuePRRefresh: async (input) => (await openGitHubShellTarget()).enqueuePrRefresh(input),
  reportVisiblePRRefreshCandidates: async (input) =>
    (await openGitHubShellTarget()).reportVisiblePrRefreshCandidates(input),
  checkAgentStartStarred: async () => (await openGitHubShellTarget()).checkAgentStartStarred(),
  starAgentStart: async (input) => (await openGitHubShellTarget()).starAgentStart(input)
}

async function openGitHubShellTarget(): Promise<GitHubShellClient> {
  return new GitHubShellClient(await openConfiguredBrowserHostProtocol())
}
