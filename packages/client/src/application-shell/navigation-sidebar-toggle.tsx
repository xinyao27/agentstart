import { useSyncExternalStore } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Sidebar } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import {
  getSidePanelPresenceSnapshot,
  subscribeSidePanelPresence
} from '../extension/side-panel/presence'

/**
 * Resident titlebar control for the in-page navigation sidebar.
 *
 * Why it sits outside the strip's trailing actions: the worktree list is shell
 * navigation, not a workspace action, so the button stays live when no workspace
 * is open and never fades with a split pane's focused chrome. `sidebarOpen` is
 * the same flag the Toggle Sidebar shortcut and the contextual tours write, so
 * every reveal path keeps working.
 */
export function NavigationSidebarToggle(): React.JSX.Element | null {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const extensionSidePanelOpen = useSyncExternalStore(
    subscribeSidePanelPresence,
    getSidePanelPresenceSnapshot,
    getSidePanelPresenceSnapshot
  )

  // Why: while the browser's own side panel renders this same navigation there
  // is no in-page column to toggle, so the control leaves the titlebar with it.
  if (extensionSidePanelOpen) {
    return null
  }

  const label = sidebarOpen
    ? translate('auto.components.applicationShell.navigationSidebarToggle.hide', 'Hide sidebar')
    : translate('auto.components.applicationShell.navigationSidebarToggle.show', 'Show sidebar')

  return (
    <div className="mr-1.5 flex shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              aria-expanded={sidebarOpen}
              onClick={toggleSidebar}
            >
              <Sidebar />
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
