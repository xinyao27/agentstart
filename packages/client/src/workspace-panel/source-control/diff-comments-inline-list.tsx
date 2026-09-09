import type { DiffComment } from '@yiru/protocol/git/diff-review'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import React from 'react'
import { getDiffCommentLineLabel, getDiffCommentSource } from '~renderer/editor/diff-comment-compat'
import { formatDiffComment } from '~renderer/editor/diff-comments-format'
import { translate } from '~renderer/i18n/i18n'
import { Check, Copy, Trash, Trash as Trash2 } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { useCopyFeedbackState } from './copy-feedback-state'
import { SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME } from './panel-constants'

export function getLocalizedDiffCommentLineLabel(
  comment: Pick<DiffComment, 'lineNumber' | 'startLine'>
): string {
  if (comment.startLine !== undefined && comment.startLine !== comment.lineNumber) {
    return translate(
      'auto.components.right.sidebar.SourceControl.d97ef8f221',
      'lines {{value0}}-{{value1}}',
      {
        value0: comment.startLine,
        value1: comment.lineNumber
      }
    )
  }
  return translate('auto.components.right.sidebar.SourceControl.6f8bfa0eb9', 'line {{value0}}', {
    value0: comment.lineNumber
  })
}

export function getLocalizedConflictKindLabel(
  kind: NonNullable<GitStatusEntry['conflictKind']>
): string {
  switch (kind) {
    case 'both_modified':
      return translate('auto.components.right.sidebar.SourceControl.c569d29a02', 'both modified')
    case 'both_added':
      return translate('auto.components.right.sidebar.SourceControl.ea7287d84f', 'both added')
    case 'deleted_by_us':
      return translate('auto.components.right.sidebar.SourceControl.bd0151ef7b', 'deleted by us')
    case 'deleted_by_them':
      return translate('auto.components.right.sidebar.SourceControl.44594e8c61', 'deleted by them')
    case 'added_by_us':
      return translate('auto.components.right.sidebar.SourceControl.24773ee581', 'added by us')
    case 'added_by_them':
      return translate('auto.components.right.sidebar.SourceControl.c03d7c952f', 'added by them')
    case 'both_deleted':
      return translate('auto.components.right.sidebar.SourceControl.5b176fa431', 'both deleted')
  }
}

export function DiffCommentsInlineList({
  comments,
  onDelete,
  onClearFile,
  onOpen
}: {
  comments: DiffComment[]
  onDelete: (commentId: string) => void
  onClearFile: (filePath: string) => void
  // Why: the note row opens its current diff/editor surface and carries the
  // comment id so that surface can scroll to the exact note.
  onOpen: (comment: DiffComment) => void
}): React.JSX.Element {
  // Why: group by filePath so the inline list mirrors the structure in the
  // Notes tab — a compact section per file with line-number prefixes.
  const groups = (() => {
    const map = new Map<string, DiffComment[]>()
    for (const c of comments) {
      const list = map.get(c.filePath) ?? []
      list.push(c)
      map.set(c.filePath, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.lineNumber - b.lineNumber)
    }
    return Array.from(map.entries())
  })()

  const [copiedId, showCopiedId] = useCopyFeedbackState<string | null>(null)

  const handleCopyOne = async (c: DiffComment): Promise<void> => {
    try {
      await shellClient.ui.writeClipboardText(formatDiffComment(c))
      showCopiedId(c.id)
    } catch {
      // Why: swallow — clipboard write can fail when the window isn't focused.
    }
  }

  if (comments.length === 0) {
    return (
      <div className="text-muted-foreground px-6 py-2 text-[11px]">
        {translate(
          'auto.components.right.sidebar.SourceControl.ac8cbe3bf5',
          'Hover over a line in the diff view and click the + to add a note.'
        )}
      </div>
    )
  }

  return (
    <div className="bg-muted/20">
      {groups.map(([filePath, list]) => (
        <div key={filePath} className={cn('py-1.5', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}>
          <div className="group/file flex items-center gap-1">
            <Button
              variant="quiet"
              size="xs"
              type="button"
              className="block h-auto min-w-0 flex-1 justify-start gap-0 truncate border-0 p-0 text-left text-[10px] whitespace-normal"
              onClick={() => {
                const first = list[0]
                if (first) {
                  onOpen(first)
                }
              }}
              title={translate(
                'auto.components.right.sidebar.SourceControl.0d963bf982',
                'Open {{value0}}',
                { value0: filePath }
              )}
            >
              {filePath}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              type="button"
              className="text-muted-foreground can-hover:opacity-0 hover:text-destructive focus-visible:text-destructive focus-visible:bg-accent h-auto border-0 p-0.5 transition-opacity group-hover/file:opacity-100 focus-visible:opacity-100"
              onClick={() => onClearFile(filePath)}
              title={translate(
                'auto.components.right.sidebar.SourceControl.59654650d3',
                'Clear notes for {{value0}}',
                { value0: filePath }
              )}
              aria-label={translate(
                'auto.components.right.sidebar.SourceControl.59654650d3',
                'Clear notes for {{value0}}',
                { value0: filePath }
              )}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
          <ul className="mt-1 space-y-1">
            {list.map((c) => (
              <li
                key={c.id}
                className="group hover:bg-accent/40 flex items-center gap-1.5 px-1 py-0.5"
              >
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  // Why: keep open/copy/delete as sibling controls to avoid
                  // nested interactive elements and bubbled key activation.
                  className="focus-visible:bg-accent flex h-auto min-w-0 flex-1 justify-start gap-1.5 border-0 p-0 text-left font-normal whitespace-normal"
                  onClick={() => onOpen(c)}
                  title={translate(
                    'auto.components.right.sidebar.SourceControl.0b5b8c234c',
                    'Open {{value0}} ({{value1}})',
                    { value0: c.filePath, value1: getLocalizedDiffCommentLineLabel(c) }
                  )}
                  aria-label={translate(
                    'auto.components.right.sidebar.SourceControl.3eb9b2805e',
                    'Open note on {{value0}}',
                    { value0: getLocalizedDiffCommentLineLabel(c) }
                  )}
                >
                  <span className="bg-muted text-muted-foreground shrink-0 px-1 py-0.5 text-[10px] leading-none tabular-nums">
                    {getDiffCommentLineLabel(c, true)}
                  </span>
                  <span className="bg-muted/70 text-muted-foreground shrink-0 px-1 py-0.5 text-[10px] leading-none">
                    {getDiffCommentSource(c) === 'markdown'
                      ? translate('auto.components.right.sidebar.SourceControl.94c42b252e', 'MD')
                      : translate('auto.components.right.sidebar.SourceControl.c56ba7fa06', 'Diff')}
                  </span>
                  {c.sentAt ? (
                    <span className="bg-muted/70 text-muted-foreground shrink-0 px-1 py-0.5 text-[10px] leading-none">
                      {translate('auto.components.right.sidebar.SourceControl.655633c08a', 'Sent')}
                    </span>
                  ) : null}
                  <span className="text-foreground block min-w-0 flex-1 text-[11px] leading-snug break-words whitespace-pre-wrap">
                    {c.body}
                  </span>
                </Button>
                <Button
                  variant="quiet"
                  size="xs"
                  type="button"
                  className="can-hover:opacity-0 h-auto border-0 p-0.5 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => void handleCopyOne(c)}
                  title={translate(
                    'auto.components.right.sidebar.SourceControl.1623bf4e19',
                    'Copy note'
                  )}
                  aria-label={translate(
                    'auto.components.right.sidebar.SourceControl.c085946bda',
                    'Copy note on line {{value0}}',
                    { value0: c.lineNumber }
                  )}
                >
                  {copiedId === c.id ? <Check className="size-3" /> : <Copy className="size-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  className="text-muted-foreground can-hover:opacity-0 hover:text-destructive focus-visible:text-destructive focus-visible:bg-accent h-auto border-0 p-0.5 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => onDelete(c.id)}
                  title={translate(
                    'auto.components.right.sidebar.SourceControl.b656381c18',
                    'Delete note'
                  )}
                  aria-label={translate(
                    'auto.components.right.sidebar.SourceControl.c321542ee2',
                    'Delete note on line {{value0}}',
                    { value0: c.lineNumber }
                  )}
                >
                  <Trash className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
