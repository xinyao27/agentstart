import { GITHUB_PROTOCOL_CAPABILITY, GitHubClient } from '@agentstart/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openGitHubTarget(): Promise<GitHubClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(GITHUB_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new GitHubClient(await openConfiguredBrowserHostProtocol())
}
