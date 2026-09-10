import { getBranchPrefixIssue, normalizeBranchPrefix } from '@agentstart/protocol/git/branch-prefix'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'

export function BranchPrefixFeedback({ rawPrefix }: { rawPrefix: string }): React.JSX.Element {
  const normalizedPrefix = normalizeBranchPrefix(rawPrefix)
  const issue = getBranchPrefixIssue(rawPrefix)

  let message: string | null = null
  if (issue) {
    message = translate(
      'auto.components.settings.BranchPrefixFeedback.6c40c0908f',
      'Prefix cannot contain spaces or Git-reserved characters such as ~ ^ : ? * [ or \\'
    )
  } else if (normalizedPrefix) {
    message = translate(
      'auto.components.settings.BranchPrefixFeedback.64d70b156a',
      'Branches will be named {{example}}',
      { example: `${normalizedPrefix}/feature` }
    )
  } else if (rawPrefix.trim()) {
    message = translate(
      'auto.components.settings.BranchPrefixFeedback.808f9a726e',
      'No prefix will be applied'
    )
  }

  return (
    <p className={`min-h-4 text-xs ${issue ? 'text-destructive' : 'text-muted-foreground'}`}>
      {message}
    </p>
  )
}
