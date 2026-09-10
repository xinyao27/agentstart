import { normalizeSearchFileMatchCount } from '@agentstart/protocol/file-match-count'
import type { SearchFileResult, SearchMatch } from '@agentstart/protocol/files/values'
import React from 'react'
import { getFileTypeIcon } from '~renderer/file-presentation/icons'
import { translate } from '~renderer/i18n/i18n'
import { Copy, CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { basename, dirname } from '~renderer/path'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '~renderer/ui/context-menu'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '~renderer/ui/tooltip'

// ─── Toggle Button ────────────────────────────────────────
export function ToggleButton({
  active,
  onClick,
  title,
  children,
  ariaExpanded
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  ariaExpanded?: boolean
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="quiet"
      size="icon-xs"
      className={cn(
        'h-auto w-auto p-0.5 flex-shrink-0 rounded-sm',
        active ? 'bg-accent text-accent-foreground' : ' hover:bg-muted'
      )}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      aria-expanded={ariaExpanded}
    >
      {children}
    </Button>
  )
}

// ─── File Result ──────────────────────────────────────────
export function FileResultRow({
  fileResult,
  onToggleCollapse,
  collapsed
}: {
  fileResult: SearchFileResult
  onToggleCollapse: () => void
  collapsed: boolean
}): React.JSX.Element {
  const fileName = basename(fileResult.relativePath)
  const parentDir = dirname(fileResult.relativePath)
  const dirPath = parentDir === '.' ? '' : parentDir
  const FileIcon = getFileTypeIcon(fileResult.relativePath)
  const matchCount = normalizeSearchFileMatchCount(fileResult)

  return (
    <div className="pt-1.5">
      {/* File header with context menu */}
      <TooltipProvider>
        <Tooltip>
          <ContextMenu>
            <ContextMenuTrigger
              render={
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className="group h-auto w-full justify-start gap-1 px-2 py-0.5 text-left"
                      onClick={onToggleCollapse}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3 flex-shrink-0 text-muted-foreground transition-transform',
                          !collapsed && 'rotate-90'
                        )}
                      />
                      {React.createElement(FileIcon, {
                        className: 'text-muted-foreground size-3.5 flex-shrink-0'
                      })}
                      <div className="min-w-0 flex-1 text-xs">
                        <span className="block min-w-0 truncate">
                          <span className="text-foreground">{fileName}</span>
                          {dirPath && (
                            <span className="text-muted-foreground ml-1.5 text-[11px]">
                              {dirPath}
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="text-muted-foreground bg-muted/80 flex-shrink-0 rounded-full px-1.5 text-[10px]">
                        {matchCount}
                      </span>
                    </Button>
                  }
                />
              }
            />
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() => shellClient.ui.writeClipboardText(fileResult.relativePath)}
              >
                <Copy className="size-3.5" />
                {translate(
                  'auto.components.right.sidebar.SearchResultItems.3596b9668d',
                  'Copy Path'
                )}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {/* Why: the row label intentionally truncates long parent paths to
             keep the result list compact, so the tooltip preserves the full
             relative path for copy/verification without widening the row. */}
          <TooltipContent side="top" sideOffset={6}>
            {fileResult.relativePath}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

// ─── Match Item ───────────────────────────────────────────
export function MatchResultRow({
  match,
  relativePath,
  onClick
}: {
  match: SearchMatch
  relativePath: string
  onClick: (preview: boolean) => void
}): React.JSX.Element {
  // Highlight the matched text within the line
  const parts = (() => {
    const content = match.lineContent
    const col = (match.displayColumn ?? match.column) - 1 // convert to 0-indexed
    const len = match.displayMatchLength ?? match.matchLength

    if (col >= 0 && col + len <= content.length) {
      // Why: left-truncate the pre-match text so the highlight stays visible at
      // narrow sidebar widths. Without this, a long `before` pushes the match
      // off the right edge even with overflow ellipsis. Mirrors VS Code's
      // search view (see searchTreeModel/match.ts#preview → lcut).
      const BEFORE_MAX = 26
      const rawBefore = content.slice(0, col).trimStart()
      const before =
        rawBefore.length > BEFORE_MAX
          ? `…${rawBefore.slice(rawBefore.length - BEFORE_MAX)}`
          : rawBefore
      return {
        before,
        match: content.slice(col, col + len),
        after: content.slice(col + len)
      }
    }

    // Fallback
    return { before: content, match: '', after: '' }
  })()

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-[18px] w-full justify-start gap-1 py-px pr-2 pl-7 text-left"
            onMouseDown={(event) => {
              // Why: clicking a result should move focus into the opened editor.
              // If the sidebar button takes focus first, the browser can restore
              // it after the click and make the initial reveal feel flaky.
              if (event.button === 0) {
                event.preventDefault()
              }
            }}
            onClick={(event) => onClick(event.detail < 2)}
          >
            <span className="text-muted-foreground mt-px flex-shrink-0 text-[10px] tabular-nums">
              {match.line}
            </span>
            <span className="flex min-w-0 items-baseline text-xs whitespace-pre">
              <span className="text-muted-foreground flex-shrink-0">{parts.before}</span>
              {parts.match && (
                <span className="text-foreground flex-shrink-0 rounded-sm bg-amber-500/30">
                  {parts.match}
                </span>
              )}
              <span className="text-muted-foreground min-w-0 truncate">{parts.after}</span>
            </span>
          </Button>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => shellClient.ui.writeClipboardText(`${relativePath}#L${match.line}`)}
        >
          <Copy className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.SearchResultItems.cc06595a3b',
            'Copy Line Path'
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
