import { cn } from '~renderer/ui/class-names'
import type { YiruProfileSummary } from '~renderer/yiru-profiles/profile-model'

export function YiruProfileAvatar({
  profile,
  className
}: {
  profile: YiruProfileSummary
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center border border-border bg-muted text-[11px] font-semibold text-muted-foreground',
        className
      )}
      aria-hidden
    >
      {profile.avatar.initials.slice(0, 2).toUpperCase()}
    </span>
  )
}
