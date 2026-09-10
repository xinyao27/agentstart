import { cn } from '~renderer/ui/class-names'

import type { WorktreeCardPrDisplay } from './worktree-card/pr-display'
import { PullRequestIcon } from './worktree-card/presentation'

export function getReviewLabel(): 'PR' {
  return 'PR'
}

export function ReviewIcon({
  review,
  className
}: {
  review: WorktreeCardPrDisplay
  className?: string
}): React.JSX.Element {
  const Icon = PullRequestIcon
  const checkTone =
    review.state !== 'merged' && review.status === 'failure'
      ? 'text-rose-500/85'
      : review.state !== 'merged' && review.status === 'pending'
        ? 'text-amber-500/85'
        : review.state === 'open' && review.status === 'success'
          ? 'text-emerald-500/80'
          : null
  return (
    <Icon
      className={cn(
        className,
        checkTone,
        review.state === 'merged' && 'text-purple-600/70 dark:text-purple-400/70',
        !checkTone && review.state === 'open' && 'text-emerald-500/80',
        !checkTone && review.state === 'closed' && 'text-muted-foreground/60',
        !checkTone && review.state === 'draft' && 'text-muted-foreground/50',
        !checkTone &&
          (!review.state || !['merged', 'open', 'closed', 'draft'].includes(review.state)) &&
          'text-muted-foreground opacity-70'
      )}
    />
  )
}
