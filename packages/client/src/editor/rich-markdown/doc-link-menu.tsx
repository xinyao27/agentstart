import type { Editor } from '@tiptap/react'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { commitRow } from './commands'
import type { DocLinkMenuRow, DocLinkMenuState } from './commands'

type RichMarkdownDocLinkMenuProps = {
  editor: Editor | null
  menu: DocLinkMenuState
  rows: DocLinkMenuRow[]
  totalMatches: number
  selectedIndex: number
}

export function RichMarkdownDocLinkMenu({
  editor,
  menu,
  rows,
  totalMatches,
  selectedIndex
}: RichMarkdownDocLinkMenuProps): React.JSX.Element {
  const overflow = totalMatches > rows.length
  return (
    <div
      className="bg-popover text-popover-foreground absolute z-30 flex max-h-[320px] w-[min(360px,calc(100%-24px))] flex-col overflow-y-auto rounded-lg border border-[color-mix(in_srgb,var(--border)_76%,transparent)]"
      style={{ left: menu.left, top: menu.top }}
      role="listbox"
      aria-label={translate(
        'auto.components.editor.RichMarkdownDocLinkMenu.0e8489bc11',
        'Markdown document links'
      )}
    >
      {rows.length === 0 ? (
        <div className="text-muted-foreground cursor-default px-3 py-2 text-sm italic">
          {translate(
            'auto.components.editor.RichMarkdownDocLinkMenu.63ced7cb9b',
            'No documents found'
          )}
        </div>
      ) : (
        rows.map((row, index) => {
          const rowKey = row.kind === 'document' ? row.document.filePath : row.id
          return (
            <Button
              variant="ghost"
              size="xs"
              key={rowKey}
              type="button"
              className={cn(
                'h-auto w-full justify-start gap-2.5 border-0 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent',
                index === selectedIndex && 'bg-accent'
              )}
              // Why: mousedown inside the editor-mounted popover would otherwise
              // blur the editor before click fires, losing the selection we need
              // to run the commit transaction against.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor && commitRow(editor, menu, row)}
            >
              {row.kind === 'document' ? (
                <span className="flex min-w-0 flex-1 flex-col items-start">
                  <span className="truncate text-sm font-medium">{row.document.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {row.document.relativePath}
                  </span>
                </span>
              ) : (
                <span className="truncate text-sm">{row.label}</span>
              )}
            </Button>
          )
        })
      )}
      {overflow ? (
        <div className="text-muted-foreground border-t border-[color-mix(in_srgb,var(--border)_60%,transparent)] px-3 py-1.5 text-[11px]">
          {translate('auto.components.editor.RichMarkdownDocLinkMenu.2aaf7d9678', 'Showing')}
          {rows.length}{' '}
          {translate('auto.components.editor.RichMarkdownDocLinkMenu.90c5f0e1e4', 'of')}
          {totalMatches}
        </div>
      ) : null}
      <div className="text-muted-foreground border-t border-[color-mix(in_srgb,var(--border)_60%,transparent)] px-3 py-1.5 text-[11px] tabular-nums">
        {translate(
          'auto.components.editor.RichMarkdownDocLinkMenu.e17b987473',
          '↑↓ navigate&nbsp;&nbsp;↵ select&nbsp;&nbsp;esc dismiss'
        )}
      </div>
    </div>
  )
}
