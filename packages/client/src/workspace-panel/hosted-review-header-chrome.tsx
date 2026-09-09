import type { HostedReviewInfo } from '@yiru/protocol/hosted-review/types'
import React from 'react'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { cn } from '~renderer/ui/class-names'

function hostedReviewLabel(review: HostedReviewInfo): string {
  return `PR #${review.number}`
}

export function HostedReviewHeaderLink({
  review
}: {
  review: HostedReviewInfo
}): React.JSX.Element {
  const label = hostedReviewLabel(review)
  const className =
    'shrink-0 border-0 bg-transparent p-0 text-left font-medium leading-none text-foreground underline decoration-border underline-offset-2 opacity-80 hover:text-foreground hover:decoration-foreground'

  return (
    <a
      href={review.url}
      target="_blank"
      rel="noreferrer"
      className={cn('outline-none focus-visible:bg-accent', className)}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        openHttpLink(review.url, { event })
      }}
    >
      {label}
    </a>
  )
}
