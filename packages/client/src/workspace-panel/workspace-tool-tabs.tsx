import type { ActiveWorkspacePanelTab } from '@agentstart/protocol/settings/ui-state'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Files, GitMerge, Robot as Agent } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'
import { returnToWorkspaceView } from '~renderer/workspace/return-to-workspace-view'

import { showWorkspacePanel } from './show-workspace-panel'

type WorkspaceToolTab = {
  id: ActiveWorkspacePanelTab
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const TOOL_TABS: readonly WorkspaceToolTab[] = [
  {
    id: 'vault',
    icon: Agent,
    label: translate('auto.components.workspacePanel.toolTabs.agents', 'Agents')
  },
  {
    id: 'source-control',
    icon: GitMerge,
    label: translate('auto.components.workspacePanel.toolTabs.changes', 'Changes')
  },
  {
    id: 'explorer',
    icon: Files,
    label: translate('auto.components.workspacePanel.toolTabs.files', 'Files')
  }
]

type WorkspaceToolTabsProps = {
  /**
   * Why: the island is resident titlebar chrome, so it also renders while a
   * page is open with no workspace. `null` means there is no workspace to act
   * on: the island stays in place, inert, so the strip's left edge — and with
   * it every tab's silhouette — never shifts between the two cases.
   */
  scope: { worktreeId: string } | null
}

export function WorkspaceToolTabs({ scope }: WorkspaceToolTabsProps): React.JSX.Element {
  const workspacePanelOpen = useAppStore((state) => state.workspacePanelOpen)
  const workspacePanelTab = useAppStore((state) => state.workspacePanelTab)
  const setWorkspacePanelOpen = useAppStore((state) => state.setWorkspacePanelOpen)
  const inert = scope === null
  // Why: same string the tab bar's inert controls use, keyed once so the
  // titlebar never explains the same absence two different ways.
  const inertLabel = translate(
    'auto.components.AppScopeStrip.requiresWorkspace',
    'Create a workspace first'
  )

  // Why: the panel is a shell-level column, so picking a tool here decides
  // which panel that column shows — it must not move split focus or open a tab.
  const handleSelect = (tab: WorkspaceToolTab): void => {
    if (!scope) {
      return
    }
    returnToWorkspaceView()
    if (workspacePanelOpen && workspacePanelTab === tab.id) {
      setWorkspacePanelOpen(false)
      return
    }
    showWorkspacePanel({ view: tab.id, worktreeId: scope.worktreeId })
  }

  return (
    <div
      // Why: the island is a flat tinted track rather than an engraved groove —
      // the depth in this strip comes from the selected cap lifting out of it,
      // so an inner shadow here would read as a well the cap cannot leave.
      className="border-border bg-card my-1 ml-1.5 flex h-[calc(100%-0.5rem)] shrink-0 items-center gap-0.5 rounded-lg border p-0.5"
      data-workspace-tool-tabs="true"
      role="tablist"
      aria-label={translate('auto.components.workspacePanel.toolTabs.label', 'Workspace tools')}
    >
      {TOOL_TABS.map((tab) => {
        const Icon = tab.icon
        const active = !inert && workspacePanelOpen && workspacePanelTab === tab.id
        const label = inert ? inertLabel : tab.label
        return (
          <Tooltip key={tab.id}>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="workspace-tool"
                  size="workspace-tool"
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? 'page' : undefined}
                  aria-label={label}
                  aria-disabled={inert}
                  className={inert ? 'min-w-0 cursor-not-allowed p-0 opacity-50' : 'min-w-0 p-0'}
                  onClick={() => handleSelect(tab)}
                >
                  <Icon className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={6}>
              {label}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
