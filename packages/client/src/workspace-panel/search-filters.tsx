import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Input } from '~renderer/ui/input'

export type SearchFiltersProps = {
  includePattern: string
  excludePattern: string
  onIncludeChange: (value: string) => void
  onExcludeChange: (value: string) => void
  includeInputRef?: React.RefObject<HTMLInputElement | null>
  excludeInputRef?: React.RefObject<HTMLInputElement | null>
}

export function SearchFilters({
  includePattern,
  excludePattern,
  onIncludeChange,
  onExcludeChange,
  includeInputRef,
  excludeInputRef
}: SearchFiltersProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {translate('auto.components.workspacePanel.SearchFilters.a69ee1bd0e', 'Files To Include')}
        </span>
        <Input
          ref={includeInputRef}
          type="text"
          size="xs"
          placeholder={translate(
            'auto.components.workspacePanel.SearchFilters.8a77efcbd1',
            'files to include (e.g. *.ts, src/**)'
          )}
          value={includePattern}
          onChange={(e) => onIncludeChange(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {translate('auto.components.workspacePanel.SearchFilters.0a6412a895', 'Files To Exclude')}
        </span>
        <Input
          ref={excludeInputRef}
          type="text"
          size="xs"
          placeholder={translate(
            'auto.components.workspacePanel.SearchFilters.01e4671ccf',
            'files to exclude (e.g. *.min.js, dist/**)'
          )}
          value={excludePattern}
          onChange={(e) => onExcludeChange(e.target.value)}
          spellCheck={false}
        />
      </label>
    </div>
  )
}
