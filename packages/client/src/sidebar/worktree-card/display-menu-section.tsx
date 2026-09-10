import type { WorktreeCardProperty } from '@agentstart/protocol/settings/ui-state'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '~renderer/ui/dropdown-menu'

import { getWorktreeCardPropertyOptions } from '../workspace-option-items'

export function WorktreeCardDisplayMenuSection(): React.JSX.Element {
  const worktreeCardProperties = useAppStore((s) => s.worktreeCardProperties)
  const setWorktreeCardProperties = useAppStore((s) => s.setWorktreeCardProperties)
  const { projectGroups } = useProjectCatalog()
  const hasProjectGroups = projectGroups.length > 0
  const worktreeCardPropertyOptions = (() => getWorktreeCardPropertyOptions({ hasProjectGroups }))()
  const handleWorktreeCardPropertyChange = (
    properties: readonly WorktreeCardProperty[],
    checked: boolean
  ): void => {
    const next = checked
      ? [...worktreeCardProperties, ...properties]
      : worktreeCardProperties.filter((property) => !properties.includes(property))
    setWorktreeCardProperties(next)
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex flex-1 items-center justify-between gap-3">
          {translate(
            'auto.components.sidebar.SidebarWorkspaceOptionsMenu.cardDisplay.title',
            'Card display'
          )}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {worktreeCardPropertyOptions.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.id}
            checked={opt.properties.every((property) => worktreeCardProperties.includes(property))}
            onCheckedChange={(checked) =>
              handleWorktreeCardPropertyChange(opt.properties, checked === true)
            }
            onClick={(event) => event.preventDefault()}
            closeOnClick={false}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
