// Why: updater, support, and install surfaces must move together when the
// canonical product repository changes.
export const YIRU_GITHUB_REPOSITORY_OWNER = 'xinyao27'
export const YIRU_GITHUB_REPOSITORY_NAME = 'yiru'
export const YIRU_GITHUB_REPOSITORY_SLUG = `${YIRU_GITHUB_REPOSITORY_OWNER}/${YIRU_GITHUB_REPOSITORY_NAME}`
export const YIRU_GITHUB_REPOSITORY_HOST_PATH = `github.com/${YIRU_GITHUB_REPOSITORY_SLUG}`
export const YIRU_GITHUB_REPOSITORY_URL = `https://${YIRU_GITHUB_REPOSITORY_HOST_PATH}`
export const YIRU_GITHUB_RELEASES_URL = `${YIRU_GITHUB_REPOSITORY_URL}/releases`
export const YIRU_GITHUB_RELEASE_DOWNLOADS_URL = `${YIRU_GITHUB_RELEASES_URL}/download`
export const YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL = `${YIRU_GITHUB_RELEASES_URL}/latest/download`
export const YIRU_GITHUB_ISSUES_URL = `${YIRU_GITHUB_REPOSITORY_URL}/issues`
export const YIRU_GITHUB_STARGAZERS_URL = `${YIRU_GITHUB_REPOSITORY_URL}/stargazers`
