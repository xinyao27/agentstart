import { getRepoIdFromWorktreeId } from '@yiru/protocol/worktree/identity'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { DotsThree as MoreHorizontal, X } from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getTitlebarMoreDropIndicatorClasses } from '../workspace-panel/titlebar-drop-indicator'
import type { WorkspacePanelTitlebarModel } from '../workspace-panel/use-workspace-panel-titlebar-model'
import { TabBarQuickCommandsButton } from './quick-commands-button'

export function TabBarMoreButton({
  worktreeId,
  groupId,
  onClosePane,
  panelTitlebar = null
}: {
  worktreeId: string
  groupId: string
  onClosePane?: () => void
  panelTitlebar?: WorkspacePanelTitlebarModel | null
}): React.JSX.Element | null {
  const worktree = useAppStore((state) => state.getKnownWorktreeById(worktreeId) ?? null)
  const { repos } = useProjectCatalog()
  const canOpenWorktree = Boolean(worktree)
  const canShowQuickCommands =
    canOpenWorktree && repos.some((repo) => repo.id === getRepoIdFromWorktreeId(worktreeId))
  const [menuOpen, setMenuOpen] = useState(false)
  const overflowItems = panelTitlebar?.overflowItems ?? []
  const hasOverflow = overflowItems.length > 0
  const commandsInOverflow = overflowItems.some((item) => item.kind === 'commands')
  const hasExistingActions =
    Boolean(onClosePane) || (canShowQuickCommands && (!panelTitlebar || commandsInOverflow))

  if (!hasExistingActions && !panelTitlebar) {
    return null
  }

  const label = translate('auto.components.tab.bar.TabBarMoreButton.more', 'More')
  return (
    <Tooltip>
      <DropdownMenu
        modal={false}
        open={menuOpen}
        onOpenChange={(next) => {
          // Why: keep More open while a panel chip is mid-drag so overflow
          // items can be pulled onto the strip without the menu collapsing.
          if (!next && panelTitlebar?.isPanelDragActive) {
            return
          }
          setMenuOpen(next)
        }}
      >
        {/* Why: trailing titlebar actions span the header so their seams align with full-height tabs. */}
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline-transparent"
                  size="icon-titlebar-wide"
                  data-workspace-titlebar-drop="more"
                  aria-label={label}
                  className={cn(
                    'relative text-muted-foreground',
                    panelTitlebar
                      ? getTitlebarMoreDropIndicatorClasses({
                          dropTarget: panelTitlebar.dropTarget,
                          visibleCount: panelTitlebar.visibleItems.length
                        })
                      : null
                  )}
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal />
                </Button>
              }
            />
          }
        />
        <DropdownMenuContent align="end" side="bottom" sideOffset={4} keepMounted>
          {panelTitlebar ? (
            <>
              <DropdownMenuLabel>
                {translate(
                  'auto.components.tab.bar.TabBarMoreButton.panelsSection',
                  'Titlebar actions'
                )}
              </DropdownMenuLabel>
              {hasOverflow ? (
                overflowItems.map((item) => {
                  if (item.kind === 'commands') {
                    return (
                      <TabBarQuickCommandsButton
                        key={item.id}
                        worktreeId={worktreeId}
                        groupId={groupId}
                        presentation="menu-item"
                        moreMenuOpen={menuOpen}
                        onMoreMenuOpenChange={setMenuOpen}
                        titlebarModel={panelTitlebar}
                        titlebarSource="overflow"
                      />
                    )
                  }
                  const Icon = panelTitlebar.resolveItemIcon(
                    item,
                    panelTitlebar.activePanelId === item.id
                  )
                  const shortcut = item.kind === 'panel' ? panelTitlebar.shortcutFor(item.id) : null
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      // Why: start the pointer drag before the menu row steals the
                      // gesture; otherwise overflow chips cannot leave the menu.
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        panelTitlebar.handleItemPointerDown(event, item.id, 'overflow')
                      }}
                      onClick={() => panelTitlebar.activateItem(item)}
                      className={cn(
                        'cursor-grab active:cursor-grabbing',
                        item.kind === 'panel' &&
                          panelTitlebar.activePanelId === item.id &&
                          'text-primary'
                      )}
                    >
                      <Icon size={14} />
                      <span>{item.kind === 'panel' ? item.panel.title : item.title}</span>
                      {shortcut &&
                      shortcut.keys.length > 0 &&
                      item.kind === 'panel' &&
                      item.panel.shortcut ? (
                        <DropdownMenuShortcut>{item.panel.shortcut}</DropdownMenuShortcut>
                      ) : null}
                    </DropdownMenuItem>
                  )
                })
              ) : (
                <DropdownMenuItem disabled>
                  {translate(
                    'auto.components.tab.bar.TabBarMoreButton.panelsEmptyHint',
                    'Drag an action here to hide it from the titlebar'
                  )}
                </DropdownMenuItem>
              )}
              {onClosePane ? <DropdownMenuSeparator /> : null}
            </>
          ) : canShowQuickCommands ? (
            <TabBarQuickCommandsButton
              worktreeId={worktreeId}
              groupId={groupId}
              presentation="menu-item"
              moreMenuOpen={menuOpen}
              onMoreMenuOpenChange={setMenuOpen}
              separatorAfter={Boolean(onClosePane)}
            />
          ) : null}
          {onClosePane ? (
            <DropdownMenuItem onClick={onClosePane}>
              <X className="size-4" />
              {translate(
                'auto.components.tab.group.TabGroupPanel.closePaneColumn',
                'Close split pane'
              )}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
