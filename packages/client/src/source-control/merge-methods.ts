import { GITHUB_PR_MERGE_METHODS } from '@agentstart/protocol/hosted-review/merge-methods'
import type {
  GitHubPRMergeMethod,
  GitHubPRMergeMethodSettings
} from '@agentstart/protocol/hosted-review/pull-request-types'
import { translate } from '~renderer/i18n/i18n'

function getMergeMethodLabels(): Record<GitHubPRMergeMethod, string> {
  return {
    squash: translate('sourceControl.merge.squash', 'Squash and merge'),
    merge: translate('sourceControl.merge.create', 'Create merge commit'),
    rebase: translate('sourceControl.merge.rebase', 'Rebase and merge')
  }
}

type GitHubPRMergeMethodOption = {
  method: GitHubPRMergeMethod
  label: string
}

export type GitHubPRMergeMethodPresentation = {
  defaultMethod: GitHubPRMergeMethod
  defaultLabel: string
  methods: GitHubPRMergeMethodOption[]
}

function allMethodsAllowed(): Record<GitHubPRMergeMethod, boolean> {
  return {
    squash: true,
    merge: true,
    rebase: true
  }
}

export function resolveGitHubPRMergeMethods(
  settings?: GitHubPRMergeMethodSettings | null
): GitHubPRMergeMethodPresentation {
  const labels = getMergeMethodLabels()
  const allowedMethods = settings?.allowedMethods ?? allMethodsAllowed()
  const firstAllowedMethod = GITHUB_PR_MERGE_METHODS.find((method) => allowedMethods[method])
  const defaultMethod =
    settings?.defaultMethod && allowedMethods[settings.defaultMethod]
      ? settings.defaultMethod
      : (firstAllowedMethod ?? 'squash')
  const orderedMethods = [
    defaultMethod,
    ...GITHUB_PR_MERGE_METHODS.filter((method) => method !== defaultMethod)
  ].filter((method) => allowedMethods[method])
  const methods = (orderedMethods.length > 0 ? orderedMethods : GITHUB_PR_MERGE_METHODS).map(
    (method) => ({
      method,
      label: labels[method]
    })
  )
  return {
    defaultMethod,
    defaultLabel: labels[defaultMethod],
    methods
  }
}
