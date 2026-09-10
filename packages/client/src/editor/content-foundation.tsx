import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  WarningCircle as AlertCircle,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import type { OpenFile, PendingEditorReveal } from './state'

export const noopEditorContentChange = (_content: string): void => {}
export const noopEditorSave = (_content: string): void => {}
export const noopCloseMarkdownTableOfContents = (): void => {}

export function getMarkdownSourceLineOffset(frontMatterRaw: string): number {
  let offset = 0

  for (let index = 0; index < frontMatterRaw.length; index++) {
    const code = frontMatterRaw.charCodeAt(index)

    if (code === 13) {
      offset++
      if (frontMatterRaw.charCodeAt(index + 1) === 10) {
        index++
      }
      continue
    }

    if (code === 10) {
      offset++
    }
  }

  return offset
}

export function matchesPendingEditorReveal(
  reveal: PendingEditorReveal | null,
  file: Pick<OpenFile, 'id' | 'filePath'>
): reveal is PendingEditorReveal {
  if (!reveal) {
    return false
  }
  return reveal.fileId ? reveal.fileId === file.id : reveal.filePath === file.filePath
}

export function FileLoadErrorView({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="bg-background text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
      <div className="border-border bg-background flex max-w-xl items-start gap-3 rounded-md border p-4">
        <AlertCircle className="text-destructive mt-0.5 size-4 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-foreground font-medium">
            {translate('auto.components.editor.EditorContent.39f018b052', 'Unable to load file')}
          </div>
          <div className="mt-1 break-words">{message}</div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            {translate('auto.components.editor.EditorContent.2a512bb46a', 'Retry')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Why: the banner is read-only context, not another editor state owner. Keeping
// it stateless avoids layout changes that interfere with ProseMirror scrolling.
export function FrontMatterBanner({ raw }: { raw: string }): React.JSX.Element {
  const inner = raw
    .replace(/^(?:---|\+\+\+)\r?\n/, '')
    .replace(/\r?\n(?:---|\+\+\+)\r?\n?$/, '')
    .trim()

  return (
    <div className="border-border/60 bg-muted/40 border-b px-3 py-2">
      <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
        {translate('auto.components.editor.EditorContent.e4b074749d', 'Front Matter')}
        <span className="ml-2 font-normal tracking-normal normal-case opacity-70">
          {translate('auto.components.editor.EditorContent.56dba34e1a', '(edit in source mode)')}
        </span>
      </div>
      <pre className="text-muted-foreground scrollbar-editor max-h-32 overflow-auto font-mono text-xs whitespace-pre-wrap">
        {inner}
      </pre>
    </div>
  )
}
