import type { RightSidebarExplorerView } from '@yiru/protocol/settings/ui-state'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Tabs, TabsList, TabsTrigger } from '~renderer/ui/tabs'

type FileExplorerViewSwitchProps = {
  view: RightSidebarExplorerView
  onSelectView: (view: RightSidebarExplorerView) => void
}

type ExplorerViewOption = {
  view: RightSidebarExplorerView
  label: string
  ariaLabel: string
}

export function FileExplorerViewSwitch({
  view,
  onSelectView
}: FileExplorerViewSwitchProps): React.JSX.Element {
  const options: ExplorerViewOption[] = [
    {
      view: 'files',
      label: translate('auto.components.right.sidebar.FileExplorerViewSwitch.c4e9a2b713', 'Names'),
      ariaLabel: translate(
        'auto.components.right.sidebar.FileExplorerViewSwitch.b3c8f1a902',
        'Filter files by name'
      )
    },
    {
      view: 'search',
      label: translate(
        'auto.components.right.sidebar.FileExplorerNameFilter.7a9fb1e6aa',
        'Contents'
      ),
      ariaLabel: translate(
        'auto.components.right.sidebar.FileExplorerToolbar.c1f3f3ec70',
        'Search file contents'
      )
    }
  ]

  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        if (value === 'files' || value === 'search') {
          onSelectView(value)
        }
      }}
      className="w-full gap-0"
      data-ignore-file-explorer-keys="true"
    >
      <TabsList
        aria-label={translate(
          'auto.components.right.sidebar.FileExplorerViewSwitch.f8a2c4d1e0',
          'Explorer search mode'
        )}
      >
        {options.map((option) => (
          <TabsTrigger key={option.view} value={option.view} aria-label={option.ariaLabel}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
