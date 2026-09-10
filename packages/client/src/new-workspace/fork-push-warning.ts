import type { GitHubPrStartPoint } from '@agentstart/protocol/git/worktree-source'
import { translate } from '~renderer/i18n/i18n'

// Why: this is the one fork target where AgentStart can prepare the workspace but a
// later push may still be rejected by GitHub permissions.
export function getForkPushWarning(
  result: Pick<GitHubPrStartPoint, 'pushTarget' | 'maintainerCanModify'>
): string | null {
  return result.maintainerCanModify === false &&
    result.pushTarget !== undefined &&
    result.pushTarget.remoteName !== 'origin'
    ? translate(
        'newWorkspace.forkPushRestricted',
        'This PR has "Allow edits from maintainers" off; pushing to the fork may be rejected by GitHub.'
      )
    : null
}
