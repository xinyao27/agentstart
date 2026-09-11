const GITHUB_REPOSITORY_URL = 'https://github.com/xinyao27/agentstart'

// Why: the landing page has no product-runtime dependency. Its public links stay
// together here so retiring or adding a distribution channel is one edit.
export const siteLinks = {
  daemon: `${GITHUB_REPOSITORY_URL}/releases`,
  extension: `${GITHUB_REPOSITORY_URL}/tree/main/apps/extension`,
  github: GITHUB_REPOSITORY_URL,
  releases: `${GITHUB_REPOSITORY_URL}/releases`,
  issues: `${GITHUB_REPOSITORY_URL}/issues`,
  license: `${GITHUB_REPOSITORY_URL}/blob/main/LICENSE`,
  testflight: 'https://testflight.apple.com/join/67PVx1Se'
} as const
