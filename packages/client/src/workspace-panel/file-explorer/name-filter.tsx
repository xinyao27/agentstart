import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Funnel as ListFilter, X } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'

import { RIGHT_SIDEBAR_INPUT_BUTTON_SURFACE_CLASS_NAME } from '../right-sidebar-button-styles'

type FileExplorerNameFilterProps = {
  query: string
  loading?: boolean
  onQueryChange: (value: string) => void
  onClear: () => void
}

export function FileExplorerNameFilter({
  query,
  loading = false,
  onQueryChange,
  onClear
}: FileExplorerNameFilterProps): React.JSX.Element {
  return (
    <div
      className="border-border bg-input/50 focus-within:border-ring flex h-7 items-center gap-1 rounded-sm border px-1.5"
      data-ignore-file-explorer-keys="true"
    >
      <ListFilter className="text-muted-foreground size-3.5 shrink-0" />
      <Input
        type="text"
        variant="chrome-free"
        size="xs"
        className="flex-1"
        aria-label={translate(
          'auto.components.right.sidebar.FileExplorerNameFilter.26fb73c6e3',
          'Find files'
        )}
        placeholder={translate(
          'auto.components.right.sidebar.FileExplorerNameFilter.26fb73c6e3',
          'Find files'
        )}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        spellCheck={false}
      />
      {loading ? <LoadingIndicator className="text-muted-foreground size-3 shrink-0" /> : null}
      {query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            RIGHT_SIDEBAR_INPUT_BUTTON_SURFACE_CLASS_NAME,
            'h-auto w-auto p-0.5 rounded-sm'
          )}
          aria-label={translate(
            'auto.components.right.sidebar.FileExplorerNameFilter.4d5a6b2a49',
            'Clear file filter'
          )}
          onClick={onClear}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  )
}
