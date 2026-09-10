import { translate } from '~renderer/i18n/i18n'
import { TextAa as CaseSensitive, GitMerge, GitPullRequest } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

import type { SmartWorkspaceSourceRow } from './smart-workspace-source-results'

export type SmartWorkspaceNameSelection = {
  kind: 'github-pr' | 'branch'
  label: string
  url?: string
}

const ROW_ITEM_CLASS_NAME = 'gap-2 px-3 py-2 text-xs'

function isTypedTextSourceRow(row: SmartWorkspaceSourceRow): boolean {
  return row.kind === 'use-name' || row.kind === 'create-branch'
}

export function getSmartWorkspaceRowClassName(
  row: SmartWorkspaceSourceRow,
  options?: { pinnedAction?: boolean }
): string {
  return cn(
    ROW_ITEM_CLASS_NAME,
    options?.pinnedAction && isTypedTextSourceRow(row) && 'bg-muted/35'
  )
}

export function SmartWorkspaceRowIcon({
  row
}: {
  row: SmartWorkspaceSourceRow
}): React.JSX.Element {
  if (row.kind === 'use-name') {
    return <CaseSensitive className="text-muted-foreground size-3.5 shrink-0" />
  }
  if (row.kind === 'github') {
    return <GitPullRequest className="text-muted-foreground size-3.5 shrink-0" />
  }
  return <GitMerge className="text-muted-foreground size-3.5 shrink-0" />
}

export function SmartWorkspaceSelectionIcon({
  kind
}: {
  kind: SmartWorkspaceNameSelection['kind']
}): React.JSX.Element {
  if (kind === 'github-pr') {
    return <GitPullRequest className="text-muted-foreground size-3.5 shrink-0" />
  }
  return <GitMerge className="text-muted-foreground size-3.5 shrink-0" />
}

export function SmartWorkspaceRowLabel({
  row
}: {
  row: SmartWorkspaceSourceRow
}): React.JSX.Element {
  if (row.kind === 'use-name') {
    return (
      <span className="min-w-0 truncate">
        {translate('auto.components.new.workspace.SmartWorkspaceNameField.b1a7d679ba', 'Use')}{' '}
        <span className="text-foreground font-medium">
          {translate('auto.components.new.workspace.SmartWorkspaceNameField.34ca97bce3', '"')}
          {row.name}
          {translate('auto.components.new.workspace.SmartWorkspaceNameField.766083a596', '"')}
        </span>{' '}
        {translate(
          'auto.components.new.workspace.SmartWorkspaceNameField.a44229ce4d',
          'as workspace name'
        )}
      </span>
    )
  }
  if (row.kind === 'create-branch') {
    return (
      <span className="min-w-0 truncate">
        {translate(
          'auto.components.new.workspace.SmartWorkspaceNameField.2a0d535f69',
          'Create new branch'
        )}{' '}
        <span className="text-foreground font-mono text-[11px] font-medium">{row.name}</span>
      </span>
    )
  }
  if (row.kind === 'github') {
    return (
      <span className="min-w-0 truncate">
        <span className="text-foreground font-medium">#{row.item.number}</span> {row.item.title}
      </span>
    )
  }
  return <span className="min-w-0 truncate font-mono text-[11px]">{row.refName}</span>
}
