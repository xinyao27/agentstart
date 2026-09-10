import { AgentStartProfileSwitcher } from '../agentstart-profiles/switcher'
import { ScrollToCurrentWorkspaceToolbarButton } from './scroll-to-current-workspace-toolbar-button'
import { SidebarSettingsHelpMenu } from './settings-help-menu'

const SidebarToolbar = function SidebarToolbar() {
  return (
    <div className="mt-auto shrink-0">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <AgentStartProfileSwitcher placement="sidebar" />
          <SidebarSettingsHelpMenu />
        </div>
        <ScrollToCurrentWorkspaceToolbarButton />
      </div>
    </div>
  )
}

export default SidebarToolbar
