import type { PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import { GitPullRequest } from '~renderer/icons/hugeicons'

export { CHECK_COLOR, CHECK_ICON } from '../check-status-presentation'
export { CheckJobLogTail } from '../check-job-log-tail'
export {
  buildMergeabilityRecalculationCommands,
  ConflictingFilesSection,
  MergeConflictNotice
} from './conflict-details'
export { PRTriageStrip, ConflictTriageStrip } from './triage-strip'
export { getFailedChecksForDetails } from './check-status'
export { ChecksList } from './checks-list'
export { isMutablePRConversationComment } from './comment-actions'
export { PRCommentsList } from './comments-list'

export const PullRequestIcon = GitPullRequest

export function prStateColor(state: PRInfo['state']): string {
  switch (state) {
    case 'merged':
      return 'bg-purple-500/15 text-purple-500 border-purple-500/20'
    case 'open':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20'
    case 'closed':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'draft':
      return 'bg-muted text-muted-foreground/70 border-border'
  }
}
