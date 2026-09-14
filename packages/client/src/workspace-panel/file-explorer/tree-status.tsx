import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'

type FileExplorerTreeStatusProps = {
  isLoading: boolean
  error: string | null
  isEmpty: boolean
  emptyMessage?: string
}

export function FileExplorerTreeStatus({
  isLoading,
  error,
  isEmpty,
  emptyMessage
}: FileExplorerTreeStatusProps): React.JSX.Element | null {
  if (isLoading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-[11px]">
        <LoadingIndicator className="size-4" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-[11px]">
        {translate(
          'auto.components.workspacePanel.FileExplorerTreeStatus.c76693e456',
          'Could not load files for this workspace:'
        )}
        {error}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-[11px]">
        {emptyMessage ??
          translate(
            'auto.components.workspacePanel.FileExplorerTreeStatus.ce03835e1f',
            'No files in this workspace'
          )}
      </div>
    )
  }

  return null
}
