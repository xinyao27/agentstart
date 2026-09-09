import type { CheckStatus } from '@yiru/protocol/hosted-review/pull-request-types'
import React from 'react'
import type { ActiveRightSidebarTab } from '~renderer/editor/state'
import { translate } from '~renderer/i18n/i18n'
import { DotsThree as MoreHorizontal } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

export type ActivityBarItem = {
  id: ActiveRightSidebarTab
  icon: React.ComponentType<{
    size?: number
    className?: string
  }>
  title: string
  shortcut: string
  /** When true, hidden for non-git (folder-mode) repos. */
  gitOnly?: boolean
  /** When true, shown only for folder workspaces. */
  folderOnly?: boolean
}

const STATUS_DOT_COLOR: Record<CheckStatus, string> = {
  success: 'bg-emerald-500',
  failure: 'bg-rose-500',
  pending: 'bg-amber-500',
  neutral: 'bg-muted-foreground'
}

export function TopActivityOverflowMenu({
  items,
  activeTab,
  onSelect,
  checksStatus
}: {
  items: ActivityBarItem[]
  activeTab: ActiveRightSidebarTab
  onSelect: (tab: ActiveRightSidebarTab) => void
  checksStatus?: CheckStatus | null
}): React.JSX.Element {
  const hiddenChecksStatus =
    checksStatus && checksStatus !== 'neutral' && items.some((item) => item.id === 'source-control')
      ? checksStatus
      : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="titlebar-segment"
            size="icon-titlebar-wide"
            className="relative"
            aria-label={translate(
              'auto.components.right.sidebar.activity.bar.buttons.1fd284e931',
              'More sidebar tabs'
            )}
          >
            <MoreHorizontal />
            {hiddenChecksStatus && (
              <div
                className={cn(
                  'absolute top-[4px] right-[4px] size-[7px]',
                  STATUS_DOT_COLOR[hiddenChecksStatus] ?? 'bg-muted-foreground'
                )}
              />
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" side="bottom" sideOffset={6}>
        {items.map((item) => {
          const Icon = item.icon
          const active = item.id === activeTab
          return (
            <DropdownMenuItem
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(active && 'bg-accent text-accent-foreground')}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={14} />
              <span>{item.title}</span>
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ActivityBarButton({
  item,
  active,
  onClick,
  layout,
  mergeLeadingEdge = false,
  statusIndicator
}: {
  item: ActivityBarItem
  active: boolean
  onClick: () => void
  layout: 'top' | 'side'
  mergeLeadingEdge?: boolean
  statusIndicator?: CheckStatus | null
}): React.JSX.Element {
  const Icon = item.icon
  const isTop = layout === 'top'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={isTop ? 'titlebar-segment' : 'ghost'}
            size={isTop ? 'icon-titlebar-wide' : 'icon-lg'}
            className={cn(
              'relative',
              isTop && mergeLeadingEdge && 'border-l-0',
              !isTop && 'w-10 h-10',
              !isTop &&
                (active
                  ? 'text-foreground'
                  : 'text-muted-foreground/60 hover:text-muted-foreground')
            )}
            onClick={onClick}
            aria-label={item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className={isTop ? 'size-4' : 'size-[18px]'} />

            {statusIndicator && statusIndicator !== 'neutral' && (
              <div
                className={cn(
                  'absolute size-[7px]',
                  isTop ? 'top-[4px] right-[5px]' : 'top-[7px] right-[7px]',
                  STATUS_DOT_COLOR[statusIndicator] ?? 'bg-muted-foreground'
                )}
              />
            )}

            {active && !isTop && (
              <div className="bg-foreground absolute top-[25%] right-0 bottom-[25%] w-[2px]" />
            )}
          </Button>
        }
      />
      <TooltipContent side={isTop ? 'bottom' : 'left'} sideOffset={6}>
        {item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
      </TooltipContent>
    </Tooltip>
  )
}
