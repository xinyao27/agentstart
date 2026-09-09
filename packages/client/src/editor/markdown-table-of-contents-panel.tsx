import {
  MARKDOWN_TOC_PANEL_MIN_WIDTH,
  clampMarkdownTocPanelWidth,
  computeMaxMarkdownTocPanelWidth
} from '@yiru/protocol/settings/markdown-toc'
import React, { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { TreeStructure as ListTree, CaretRight as ChevronRight, X } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { SidebarResizeOverlay, useSidebarResize } from '~renderer/ui/use-resizable-sidebar'

import type { MarkdownTocItem, MarkdownTocLevel } from './markdown-table-of-contents'
import {
  collapseMarkdownTocToLevel,
  isMarkdownTocItemExpanded,
  pruneMarkdownTocCollapsedIds,
  toggleMarkdownTocCollapsedId
} from './markdown-toc-collapse-state'
import { MARKDOWN_TOC_RESIZE_HANDLE_CLASS_NAME } from './markdown-toc-panel-width'

type MarkdownTableOfContentsPanelProps = {
  items: MarkdownTocItem[]
  onClose: () => void
  onNavigate: (id: string) => void
}

const TOC_LEVELS: MarkdownTocLevel[] = [1, 2, 3, 4, 5]
const TOC_EXPAND_ALL_LEVEL: MarkdownTocLevel = 5
const TOC_INDENT_BASE_PX = 12
const TOC_INDENT_STEP_PX = 12

function MarkdownTocRow({
  collapsedIds,
  depth,
  item,
  onNavigate,
  onToggleCollapsed
}: {
  collapsedIds: ReadonlySet<string>
  depth: number
  item: MarkdownTocItem
  onNavigate: (id: string) => void
  onToggleCollapsed: (id: string) => void
}): React.JSX.Element {
  const hasChildren = item.children.length > 0
  const expanded = isMarkdownTocItemExpanded(collapsedIds, item)
  // Why: parents already shift title right via the disclosure chevron, so deeper
  // parents skip the base inset; only the root row keeps it so top-level titles
  // are not flush against the panel edge.
  const rowPaddingLeft = hasChildren
    ? depth === 0
      ? TOC_INDENT_BASE_PX
      : depth * TOC_INDENT_STEP_PX
    : TOC_INDENT_BASE_PX + depth * TOC_INDENT_STEP_PX

  return (
    <>
      <div
        className="text-foreground hover:bg-accent flex w-full min-w-0 items-center gap-1 py-1 pr-1 text-xs leading-[1.25]"
        style={{ paddingLeft: rowPaddingLeft }}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="xs"
            type="button"
            className="focus-visible:bg-accent inline-flex size-3 h-auto shrink-0 items-center justify-center border-0 p-0"
            aria-label={
              expanded
                ? translate(
                    'auto.components.editor.MarkdownTableOfContentsPanel.97ad46f11f',
                    'Collapse {{value0}}',
                    { value0: item.title }
                  )
                : translate(
                    'auto.components.editor.MarkdownTableOfContentsPanel.65b036a6c8',
                    'Expand {{value0}}',
                    { value0: item.title }
                  )
            }
            aria-expanded={expanded}
            onClick={() => onToggleCollapsed(item.id)}
          >
            <ChevronRight
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-90'
              )}
            />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          type="button"
          className="focus-visible:bg-accent h-auto min-w-0 flex-1 justify-start border-0 px-1 py-0.5"
          onClick={() => onNavigate(item.id)}
        >
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {item.title}
          </span>
        </Button>
      </div>
      {hasChildren && expanded
        ? item.children.map((child) => (
            <MarkdownTocRow
              key={child.id}
              collapsedIds={collapsedIds}
              depth={depth + 1}
              item={child}
              onNavigate={onNavigate}
              onToggleCollapsed={onToggleCollapsed}
            />
          ))
        : null}
    </>
  )
}

export function MarkdownTableOfContentsPanel({
  items,
  onClose,
  onNavigate
}: MarkdownTableOfContentsPanelProps): React.JSX.Element {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const renderedCollapsedIds = pruneMarkdownTocCollapsedIds(collapsedIds, items)
  const markdownTocPanelWidth = useAppStore((s) => s.markdownTocPanelWidth)
  const setMarkdownTocPanelWidth = useAppStore((s) => s.setMarkdownTocPanelWidth)
  const [layoutWidth, setLayoutWidth] = useState<number | null>(null)
  const maxPanelWidth = computeMaxMarkdownTocPanelWidth(layoutWidth ?? 0)
  const renderedPanelWidth = clampMarkdownTocPanelWidth(
    markdownTocPanelWidth,
    layoutWidth ?? undefined
  )
  const { containerRef, isResizing, onResizeStart, renderedWidth } = useSidebarResize<HTMLElement>({
    isOpen: true,
    width: renderedPanelWidth,
    minWidth: MARKDOWN_TOC_PANEL_MIN_WIDTH,
    maxWidth: maxPanelWidth,
    deltaSign: 1,
    setWidth: setMarkdownTocPanelWidth
  })

  useEffect(() => {
    const container = containerRef.current
    const layout = container?.parentElement
    if (!layout) {
      return
    }

    const updateMaxWidth = (): void => {
      setLayoutWidth(layout.clientWidth)
    }

    const observer = new ResizeObserver(updateMaxWidth)
    observer.observe(layout)
    return () => observer.disconnect()
  }, [containerRef])

  const collapseToLevel = (level: MarkdownTocLevel): void => {
    setCollapsedIds(collapseMarkdownTocToLevel(items, level))
  }

  const toggleCollapsed = (id: string): void => {
    setCollapsedIds((current) => toggleMarkdownTocCollapsedId(current, id))
  }

  return (
    <aside
      ref={containerRef}
      style={{ width: renderedWidth }}
      className="markdown-toc-panel border-border/72 relative flex shrink-0 flex-col border-r bg-[color-mix(in_srgb,var(--background)_88%,var(--editor-surface))] @max-[560px]/markdown-preview:absolute @max-[560px]/markdown-preview:inset-y-0 @max-[560px]/markdown-preview:left-0 @max-[560px]/markdown-preview:z-30"
      aria-label={translate(
        'auto.components.editor.MarkdownTableOfContentsPanel.27d0a9c49a',
        'Table of contents'
      )}
    >
      <SidebarResizeOverlay visible={isResizing} />
      <div className="markdown-toc-header border-border/72 text-muted-foreground flex min-h-10 min-w-0 items-center gap-2 border-b py-0 pr-2.5 pl-3 text-xs font-semibold">
        <ListTree className="text-muted-foreground size-3.5 shrink-0" />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {translate(
            'auto.components.editor.MarkdownTableOfContentsPanel.06357eea60',
            'Table of Contents'
          )}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <div
            className="flex items-center gap-0.5"
            role="group"
            aria-label={translate(
              'auto.components.editor.MarkdownTableOfContentsPanel.0dc7b2f05a',
              'Collapse by level'
            )}
          >
            {TOC_LEVELS.map((level) => (
              <Button
                key={level}
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground min-w-6 px-1 text-[10px] font-semibold tracking-[0.02em]"
                aria-label={
                  level === TOC_EXPAND_ALL_LEVEL
                    ? translate(
                        'auto.components.editor.MarkdownTableOfContentsPanel.f3de856175',
                        'Expand all heading levels'
                      )
                    : translate(
                        'auto.components.editor.MarkdownTableOfContentsPanel.111e66b85d',
                        'Collapse to heading level {{value0}}',
                        { value0: level }
                      )
                }
                title={
                  level === TOC_EXPAND_ALL_LEVEL
                    ? translate(
                        'auto.components.editor.MarkdownTableOfContentsPanel.a5daadd68b',
                        'Expand all'
                      )
                    : translate(
                        'auto.components.editor.MarkdownTableOfContentsPanel.4680a4b808',
                        'Collapse to H{{value0}}',
                        { value0: level }
                      )
                }
                onClick={() => collapseToLevel(level)}
              >
                H{level}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate(
              'auto.components.editor.MarkdownTableOfContentsPanel.bbe8369097',
              'Close table of contents'
            )}
            title={translate(
              'auto.components.editor.MarkdownTableOfContentsPanel.bbe8369097',
              'Close table of contents'
            )}
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length > 0 ? (
          items.map((item) => (
            <MarkdownTocRow
              key={item.id}
              collapsedIds={renderedCollapsedIds}
              depth={0}
              item={item}
              onNavigate={onNavigate}
              onToggleCollapsed={toggleCollapsed}
            />
          ))
        ) : (
          <div className="text-muted-foreground px-1.5 py-2 text-xs">
            {translate(
              'auto.components.editor.MarkdownTableOfContentsPanel.de3928b6e4',
              'No headings'
            )}
          </div>
        )}
      </div>
      <div
        data-markdown-toc-resize-handle=""
        className={MARKDOWN_TOC_RESIZE_HANDLE_CLASS_NAME}
        role="separator"
        aria-orientation="vertical"
        aria-label={translate(
          'auto.components.editor.MarkdownTableOfContentsPanel.8f4d2c1a9b',
          'Resize table of contents'
        )}
        onMouseDown={onResizeStart}
      />
    </aside>
  )
}
