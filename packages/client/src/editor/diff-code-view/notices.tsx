import type { LargeDiffRenderLimit } from '@yiru/protocol/git/render-limit'
import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import { translate } from '~renderer/i18n/i18n'
import {
  WarningCircle as AlertCircle,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import { LargeDiffFallback } from '../large-diff-fallback'

const ImageDiffViewer = lazy(() => import('../image-diff-viewer'))

/**
 * A row that carries something other than a text diff.
 *
 * Why: CodeView renders code and nothing else — there is no per-item body slot.
 * These states ride in as file-level annotations instead, which Pierre renders
 * as their own row above the file's first line.
 */
export type DiffCodeViewNotice =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'binary'; reason: string }
  | {
      kind: 'image'
      originalContent: string
      modifiedContent: string
      mimeType: string
      sideBySide: boolean
    }
  // Why: only the limited variant carries the reason and thresholds the
  // fallback card renders, so the unlimited shape cannot reach this row.
  | {
      kind: 'large-diff'
      renderLimit: Extract<LargeDiffRenderLimit, { limited: true }>
      saveLabel?: string
    }

export type DiffCodeViewNoticeHandlers = {
  filePath: string
  onRetry?: () => void
  onSaveLimitedDiff?: () => void
}

function NoticeShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="bg-muted/10 text-muted-foreground px-3 py-2 text-[11px]">{children}</div>
}

export function DiffCodeViewNoticeContent({
  notice,
  handlers
}: {
  notice: DiffCodeViewNotice
  handlers: DiffCodeViewNoticeHandlers
}): React.JSX.Element {
  if (notice.kind === 'loading') {
    return (
      <NoticeShell>
        <span className="flex items-center gap-2">
          <span className="bg-muted-foreground/50 h-1.5 w-1.5" />
          {translate('auto.components.editor.DiffSectionBody.f5cf81cec2', 'Loading diff...')}
        </span>
      </NoticeShell>
    )
  }
  if (notice.kind === 'error') {
    return (
      <NoticeShell>
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <AlertCircle className="text-destructive size-3.5 shrink-0" />
            <span className="truncate">{notice.message}</span>
          </span>
          {handlers.onRetry ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 shrink-0 px-2 text-[11px]"
              onClick={handlers.onRetry}
            >
              <RefreshCw className="size-3" />
              {translate('auto.components.editor.DiffSectionBody.cef4cf0ff5', 'Retry')}
            </Button>
          ) : null}
        </span>
      </NoticeShell>
    )
  }
  if (notice.kind === 'binary') {
    return (
      <NoticeShell>
        <span className="text-foreground text-sm font-medium">
          {translate('auto.components.editor.DiffSectionBody.35d6afb5be', 'Binary file changed')}
        </span>
        <span className="mt-1 block">{notice.reason}</span>
      </NoticeShell>
    )
  }
  if (notice.kind === 'image') {
    return (
      // Why: without a boundary here the image chunk suspends the whole editor
      // surface, which would tear down every mounted diff in the list.
      <Suspense fallback={<div className="bg-muted/10 h-8" />}>
        <ImageDiffViewer
          originalContent={notice.originalContent}
          modifiedContent={notice.modifiedContent}
          filePath={handlers.filePath}
          mimeType={notice.mimeType}
          sideBySide={notice.sideBySide}
          layout="intrinsic"
        />
      </Suspense>
    )
  }
  return (
    <LargeDiffFallback
      filePath={handlers.filePath}
      renderLimit={notice.renderLimit}
      action={
        handlers.onSaveLimitedDiff && notice.saveLabel
          ? {
              label: notice.saveLabel,
              description: translate(
                'auto.components.editor.DiffSectionBody.593f2193f6',
                'This draft crossed the safe display limit, but it can still be saved.'
              ),
              onClick: handlers.onSaveLimitedDiff
            }
          : undefined
      }
    />
  )
}
