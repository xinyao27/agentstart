import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { TerminalWindow as TerminalSquare, Plus } from '~renderer/icons/hugeicons'
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

type WorkspaceTabCreateMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  disabled?: boolean
  disabledTooltip?: string | null
  finalFocus?: React.ComponentProps<typeof DropdownMenuContent>['finalFocus']
}

export function WorkspaceTabCreateMenu({
  open,
  onOpenChange,
  children,
  disabled = false,
  disabledTooltip = null,
  finalFocus
}: WorkspaceTabCreateMenuProps): React.JSX.Element {
  const label = translate('auto.components.tab.bar.TabBar.b1a132357f', 'New tab')
  const triggerButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        'my-auto ml-1 text-muted-foreground',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-background hover:text-muted-foreground'
      )}
      // Why: the shared accessible name keeps both local and remote create
      // affordances discoverable without coupling tests to their glyph.
      aria-label={label}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) {
          event.preventDefault()
        }
      }}
      onKeyDown={(event) => {
        if (disabled && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
          event.preventDefault()
        }
      }}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault()
        }
      }}
    >
      {/* Why: the glyph matches the adjacent titlebar actions without recreating a tab cell. */}
      <Plus className="size-4" />
    </Button>
  )
  const trigger = <TooltipTrigger render={<DropdownMenuTrigger render={triggerButton} />} />

  return (
    <DropdownMenu
      open={disabled ? false : open}
      onOpenChange={(nextOpen) => {
        if (!disabled) {
          onOpenChange(nextOpen)
        }
      }}
      // Why: actions launched from this menu can leave interactive UI outside
      // the renderer surface; modal pointer suppression would strand that UI.
      modal={false}
    >
      <Tooltip>
        {trigger}
        <TooltipContent side="bottom" sideOffset={6}>
          {disabledTooltip ?? label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="border-border/80 w-72 max-w-[calc(100vw-1rem)] rounded-lg p-1"
        finalFocus={finalFocus}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WorkspaceNewTerminalMenuItem({
  onSelect,
  shortcut,
  disabled = false
}: {
  onSelect: () => void
  shortcut?: React.ReactNode
  disabled?: boolean
}): React.JSX.Element {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={onSelect}
      className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      <TerminalSquare className="text-muted-foreground size-4" />
      <span className="flex-1">
        {translate('auto.components.tab.bar.TabBar.d364f3c8d4', 'New Terminal')}
      </span>
      {shortcut ? <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut> : null}
    </DropdownMenuItem>
  )
}
