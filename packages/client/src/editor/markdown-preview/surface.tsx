import type { ReactNode, RefCallback } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Check,
  Copy,
  Chat as MessageSquare,
  CaretDown as ChevronDown,
  CaretUp as ChevronUp,
  X
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'

import { MarkdownTableOfContentsPanel } from '../markdown-table-of-contents-panel'
import type { selectMarkdownTableOfContents } from '../markdown-toc-visibility-gate'

const SEARCH_BUTTON_CLASS_NAME = 'size-[22px] text-muted-foreground hover:text-foreground'
const REVIEW_ICON_BUTTON_CLASS_NAME =
  'inline-flex size-[26px] items-center justify-center border border-transparent hover:border-border/82 aria-expanded:border-border/82 aria-expanded:bg-accent aria-expanded:text-foreground'
type MarkdownPreviewSearchSurface = {
  activeMatchIndex: number
  close: () => void
  focusPreview: () => void
  inputRef: RefCallback<HTMLInputElement>
  isOpen: boolean
  matchCount: number
  move: (direction: 1 | -1) => void
  query: string
  setQuery: (query: string) => void
}

type MarkdownPreviewReviewSurface = {
  count: number
  isCopied: boolean
  isVisible: boolean
  onCopy: () => void
  onJumpToFirst: () => void
  sendMenu: ReactNode
}

type MarkdownPreviewSurfaceProps = {
  body: ReactNode
  editorFontSize: number
  isDark: boolean
  onCloseTableOfContents: () => void
  onNavigateTableOfContents: (id: string) => void
  review: MarkdownPreviewReviewSurface
  rootRef: RefCallback<HTMLDivElement>
  search: MarkdownPreviewSearchSurface
  showTableOfContents: boolean
  tableOfContentsItems: ReturnType<typeof selectMarkdownTableOfContents>
}

export function MarkdownPreviewSurface({
  body,
  editorFontSize,
  isDark,
  onCloseTableOfContents,
  onNavigateTableOfContents,
  review,
  rootRef,
  search,
  showTableOfContents,
  tableOfContentsItems
}: MarkdownPreviewSurfaceProps): React.JSX.Element {
  return (
    <div className="@container/markdown-preview relative flex h-full min-h-0 min-w-0">
      {showTableOfContents ? (
        <MarkdownTableOfContentsPanel
          items={tableOfContentsItems}
          onClose={onCloseTableOfContents}
          onNavigate={onNavigateTableOfContents}
        />
      ) : null}
      <div
        ref={rootRef}
        tabIndex={0}
        style={{ fontSize: `${editorFontSize}px` }}
        className={cn(
          'markdown-preview relative h-full min-h-0 min-w-0 flex-1 overflow-auto px-8 py-6 leading-[1.7] scrollbar-editor focus-visible:outline-none',
          isDark ? 'markdown-dark' : 'markdown-light'
        )}
      >
        {search.isOpen ? <PreviewSearch search={search} /> : null}
        {review.isVisible ? <ReviewToolbar review={review} /> : null}
        {/* Why: page translation mutates text nodes owned by React and breaks reconciliation. */}
        {body}
      </div>
    </div>
  )
}

function PreviewSearch({
  search: { activeMatchIndex, close, focusPreview, inputRef, matchCount, move, query, setQuery }
}: {
  search: MarkdownPreviewSearchSurface
}): React.JSX.Element {
  return (
    <div
      className="markdown-preview-search border-border bg-background sticky top-0 z-20 -mr-5 mb-1.5 ml-auto flex w-fit max-w-[min(100%,460px)] items-center border pt-0 pr-0.5 pb-0 pl-1"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="border-ring bg-background flex w-[220px] min-w-0 flex-[0_1_auto] items-center border">
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              move(event.shiftKey ? -1 : 1)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              close()
              focusPreview()
            }
          }}
          placeholder={translate(
            'auto.components.editor.MarkdownPreview.517aea303b',
            'Find in preview'
          )}
          className="placeholder:text-muted-foreground h-7 !border-0 bg-transparent px-2 text-[13px] leading-none focus-visible:!border-0"
          aria-label={translate(
            'auto.components.editor.MarkdownPreview.ec77985138',
            'Find in markdown preview'
          )}
        />
      </div>
      <div className="text-muted-foreground min-w-0 flex-none px-1.5 text-xs leading-none whitespace-nowrap tabular-nums">
        {query && matchCount === 0
          ? translate('auto.components.editor.MarkdownPreview.c5dc92cfe3', 'No results')
          : `${matchCount === 0 ? 0 : activeMatchIndex + 1}/${matchCount}`}
      </div>
      <SearchButton direction={-1} isDisabled={matchCount === 0} onMove={move} />
      <SearchButton direction={1} isDisabled={matchCount === 0} onMove={move} />
      <div className="bg-border mx-0.5 h-4 w-px" />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={close}
        title={translate('auto.components.editor.MarkdownPreview.12052c639c', 'Close search')}
        aria-label={translate('auto.components.editor.MarkdownPreview.12052c639c', 'Close search')}
        className={SEARCH_BUTTON_CLASS_NAME}
      >
        <X size={14} />
      </Button>
    </div>
  )
}

function SearchButton({
  direction,
  isDisabled,
  onMove
}: {
  direction: 1 | -1
  isDisabled: boolean
  onMove: (direction: 1 | -1) => void
}): React.JSX.Element {
  const label =
    direction === -1
      ? translate('auto.components.editor.MarkdownPreview.1febd97f5c', 'Previous match')
      : translate('auto.components.editor.MarkdownPreview.b42c41bd0d', 'Next match')
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={() => onMove(direction)}
      disabled={isDisabled}
      title={label}
      aria-label={label}
      className={SEARCH_BUTTON_CLASS_NAME}
    >
      {direction === -1 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </Button>
  )
}

function ReviewToolbar({ review }: { review: MarkdownPreviewReviewSurface }): React.JSX.Element {
  return (
    <div className="border-border/72 relative z-[15] mb-2 ml-auto flex w-fit max-w-full items-center gap-1 overflow-hidden rounded-md border bg-[color-mix(in_srgb,var(--background)_94%,var(--editor-surface))] p-1">
      <Button
        variant="quiet"
        size="xs"
        type="button"
        className="hover:border-border/82 inline-flex h-[26px] min-w-0 items-center justify-center gap-1.5 border border-transparent px-2 text-xs font-semibold"
        onClick={review.onJumpToFirst}
        disabled={review.count === 0}
        title={translate(
          'auto.components.editor.MarkdownPreview.0f9969a159',
          'Jump to first review note'
        )}
        aria-label={translate(
          'auto.components.editor.MarkdownPreview.0f9969a159',
          'Jump to first review note'
        )}
      >
        <MessageSquare className="size-3.5" />
        <span>
          {translate('auto.components.editor.MarkdownPreview.322afab6ff', 'Review notes')}
        </span>
        <span className="bg-foreground/8 text-muted-foreground inline-flex h-[18px] min-w-[18px] items-center justify-center text-[11px] leading-none tabular-nums">
          {review.count}
        </span>
      </Button>
      <Button
        variant="quiet"
        size="xs"
        type="button"
        className={REVIEW_ICON_BUTTON_CLASS_NAME}
        onClick={review.onCopy}
        disabled={review.count === 0}
        title={translate(
          'auto.components.editor.MarkdownPreview.bb629de58a',
          'Copy notes for agent'
        )}
        aria-label={translate(
          'auto.components.editor.MarkdownPreview.bb629de58a',
          'Copy notes for agent'
        )}
      >
        {review.isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      {review.sendMenu}
    </div>
  )
}
