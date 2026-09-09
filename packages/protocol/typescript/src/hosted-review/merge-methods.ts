import type { GitHubPRMergeMethod, GitHubPRMergeMethodSettings } from './pull-request-types'

export const GITHUB_PR_MERGE_METHODS = ['squash', 'merge', 'rebase'] as const

export function mapGitHubDefaultMergeMethod(value: unknown): GitHubPRMergeMethod | null {
  switch (typeof value === 'string' ? value.toUpperCase() : '') {
    case 'MERGE':
      return 'merge'
    case 'SQUASH':
      return 'squash'
    case 'REBASE':
      return 'rebase'
    default:
      return null
  }
}

export function normalizeGitHubPRMergeMethodSettings(args: {
  defaultMethod: unknown
  mergeCommitAllowed: unknown
  rebaseMergeAllowed: unknown
  squashMergeAllowed: unknown
}): GitHubPRMergeMethodSettings | undefined {
  const allowedMethods = {
    squash: args.squashMergeAllowed === true,
    merge: args.mergeCommitAllowed === true,
    rebase: args.rebaseMergeAllowed === true
  }
  const defaultMethod = mapGitHubDefaultMergeMethod(args.defaultMethod)
  const firstAllowedMethod = GITHUB_PR_MERGE_METHODS.find((method) => allowedMethods[method])
  const resolvedDefault =
    defaultMethod && allowedMethods[defaultMethod]
      ? defaultMethod
      : (firstAllowedMethod ?? defaultMethod)
  if (!resolvedDefault) {
    return undefined
  }
  return {
    defaultMethod: resolvedDefault,
    allowedMethods
  }
}
