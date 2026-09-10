import React, { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Check, Copy } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

const LOG_EXCERPT_ERROR_LINE_PATTERN =
  /(?:##\[error\]|::error::|::error\b|\berror:|FAILED|exit code|ENOENT|EACCES|panic:|AssertionError)/i

function getLogExcerptScrollTop(pre: HTMLPreElement, logTail: string): number {
  const lines = logTail.split(/\r?\n/)
  let targetLineIndex = lines.length - 1
  for (let index = 0; index < lines.length; index += 1) {
    if (LOG_EXCERPT_ERROR_LINE_PATTERN.test(lines[index] ?? '')) {
      targetLineIndex = index
    }
  }

  const lineHeight = Number.parseFloat(getComputedStyle(pre).lineHeight)
  const approximateLineHeight = Number.isFinite(lineHeight) ? lineHeight : 16
  const targetScroll = targetLineIndex * approximateLineHeight
  const maxScroll = Math.max(0, pre.scrollHeight - pre.clientHeight)
  if (targetLineIndex < lines.length - 1) {
    return Math.min(maxScroll, Math.max(0, targetScroll - pre.clientHeight / 3))
  }
  return maxScroll
}

function CopyButton({
  text,
  title = 'Copy comment'
}: {
  text: string
  title?: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copiedResetTimerRef = useRef<number | null>(null)
  // Why: clipboard IPC can resolve after this row action unmounts; avoid
  // starting a reset timer that will outlive the component.
  const isMountedRef = useRef(false)

  const clearCopiedResetTimer = (): void => {
    if (copiedResetTimerRef.current !== null) {
      window.clearTimeout(copiedResetTimerRef.current)
      copiedResetTimerRef.current = null
    }
  }

  const setCopyButtonRef = (node: HTMLButtonElement | null) => {
    isMountedRef.current = node !== null
    if (node === null) {
      clearCopiedResetTimer()
    }
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    void shellClient.ui.writeClipboardText(text).then(() => {
      if (!isMountedRef.current) {
        return
      }
      clearCopiedResetTimer()
      setCopied(true)
      copiedResetTimerRef.current = window.setTimeout(() => {
        copiedResetTimerRef.current = null
        setCopied(false)
      }, 1500)
    })
  }

  return (
    <Button
      variant="quiet"
      size="xs"
      ref={setCopyButtonRef}
      className="/40 h-auto border-0 p-1"
      title={title}
      onClick={handleCopy}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  )
}

export function CheckJobLogTail({
  logTail,
  expanded = false
}: {
  logTail: string
  expanded?: boolean
}): React.JSX.Element {
  const logPreRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    const logPre = logPreRef.current
    if (!logPre) {
      return
    }
    // Why: noisy install/cache output buries failures at the top of the excerpt;
    // jump to the last error marker when present, otherwise the log end.
    logPre.scrollTop = getLogExcerptScrollTop(logPre, logTail)
  }, [expanded, logTail])

  return (
    <div className="mt-3 min-w-0">
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        <div className="text-muted-foreground min-w-0 flex-1 text-[10px] font-semibold tracking-wide uppercase">
          {translate(
            'auto.components.right.sidebar.checks.panel.content.d713f500b2',
            'Log excerpt'
          )}
        </div>
        <CopyButton
          text={logTail}
          title={translate(
            'auto.components.right.sidebar.checks.panel.content.679bf2093c',
            'Copy log excerpt'
          )}
        />
      </div>
      <pre
        ref={logPreRef}
        className={cn(
          'overflow-auto whitespace-pre-wrap bg-muted/40 p-3 font-mono text-xs text-muted-foreground scrollbar-sleek rounded',
          expanded ? 'min-h-48 max-h-[min(50vh,32rem)]' : 'max-h-72'
        )}
      >
        {logTail}
      </pre>
    </div>
  )
}
