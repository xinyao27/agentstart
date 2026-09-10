// Why: per-repo fetch budget for gh CLI calls. Shared callers must use the
// same value to preserve cache-key alignment.
export const PER_REPO_FETCH_LIMIT = 36

const GITHUB_WORK_ITEMS_SSH_REMOTE_REQUIRED_MESSAGE =
  'GitHub work items require a GitHub remote for SSH repositories'

export function isGitHubWorkItemsSshRemoteRequiredError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : typeof error === 'string'
          ? error
          : ''

  return message.includes(GITHUB_WORK_ITEMS_SSH_REMOTE_REQUIRED_MESSAGE)
}

// Why: generic over item shape for the same cross-caller reasons as
// other work-item sorting. Number-descending keeps recently created pull
// requests first when callers merge repositories.
export function sortWorkItemsByNumber<T extends { number: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.number - left.number)
}
