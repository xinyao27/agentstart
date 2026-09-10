import { UserCircle as CircleUserRound } from '~renderer/icons/hugeicons'
import { DropdownMenuLabel } from '~renderer/ui/dropdown-menu'

import { AgentStartProfileAvatar } from './avatar'
import type { AgentStartProfileSummary } from './profile-model'

export function AgentStartProfileMenuHeader({
  profile,
  title,
  subtitle,
  showProfileAvatar
}: {
  profile: AgentStartProfileSummary
  title: string
  subtitle: string
  showProfileAvatar: boolean
}): React.JSX.Element {
  return (
    <DropdownMenuLabel className="px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {showProfileAvatar ? (
          <AgentStartProfileAvatar profile={profile} className="size-7 text-xs" />
        ) : (
          <CircleUserRound className="text-muted-foreground size-5" />
        )}
        <div className="min-w-0">
          <div className="text-foreground truncate text-[13px] font-semibold">{title}</div>
          <div className="text-muted-foreground truncate text-[11px] font-medium">{subtitle}</div>
        </div>
      </div>
    </DropdownMenuLabel>
  )
}
