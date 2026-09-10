import type { DiffComment } from '@agentstart/protocol/git/diff-review'
import { EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import type React from 'react'
import { cn } from '~renderer/ui/class-names'

import type { MarkdownReviewNote } from '../markdown-review-notes'
import type { MarkdownTocItem } from '../markdown-table-of-contents'
import { MarkdownTableOfContentsPanel } from '../markdown-table-of-contents-panel'
import type { NotesSendMenuScope } from '../notes-send-menu'
import { RichMarkdownAnnotationOverlay } from './annotation-overlay'
import type { DocLinkMenuRow, DocLinkMenuState } from './commands'
import { RichMarkdownDocLinkMenu } from './doc-link-menu'
import { RichMarkdownEmojiMenu } from './emoji-menu'
import { RichMarkdownLinkBubble, type LinkBubbleState } from './link-bubble'
import type { RichMarkdownAnnotationTarget } from './review-annotations'
import { RichMarkdownReviewNoteLayer } from './review-note-layer'
import type { RichMarkdownReviewNotePosition } from './review-note-layout'
import { RichMarkdownReviewRailActions } from './review-rail-actions'
import { RichMarkdownSearchBar } from './search-bar'
import type { SlashCommand, SlashMenuState } from './slash-commands'
import { RichMarkdownSlashMenu } from './slash-menu'
import { RichMarkdownToolbar } from './toolbar'

function shouldFocusEmptyEditorFromSurfaceClick(
  event: React.MouseEvent<HTMLDivElement>,
  editor: Editor | null
): boolean {
  if (!editor?.isEmpty || event.button !== 0) {
    return false
  }
  const target = event.target
  if (!(target instanceof Element)) {
    return false
  }
  return !target.closest('.rich-markdown-editor-shell button, .rich-markdown-editor-shell input')
}

type RichMarkdownEditorSurfaceProps = {
  editor: Editor | null
  editorFontZoomLevel: number
  rootElement: HTMLDivElement | null
  rootRef: (node: HTMLDivElement | null) => void
  isModifierHeld: boolean
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  headerSlot?: React.ReactNode
  reviewRailExpanded: boolean
  reviewRailVisible: boolean
  notePositions: RichMarkdownReviewNotePosition[]
  activeReviewCommentId: string | null
  attentionReviewCommentId: string | null
  copiedReviewNoteId: string | null
  markdownReviewContent: string
  worktreeId: string
  filePath: string
  markdownCommentsCount: number
  reviewRailOpen: boolean
  reviewNotesCopied: boolean
  unsentMarkdownReviewScope: NotesSendMenuScope<MarkdownReviewNote>[]
  linkBubble: LinkBubbleState | null
  isEditingLink: boolean
  slashMenu: SlashMenuState | null
  filteredSlashCommands: SlashCommand[]
  selectedCommandIndex: number
  emojiMenu: { left: number; top: number } | null
  docLinkMenu: DocLinkMenuState | null
  docLinkRows: DocLinkMenuRow[]
  docLinkTotalMatches: number
  selectedDocLinkIndex: number
  annotationTarget: RichMarkdownAnnotationTarget | null
  annotationPopover: RichMarkdownAnnotationTarget | null
  markdownSourceLineOffset: number
  tableOfContentsItems: MarkdownTocItem[]
  showTableOfContents: boolean
  searchState: {
    activeMatchIndex: number
    isReplaceMode: boolean
    isSearchOpen: boolean
    matchCase: boolean
    matchCount: number
    replaceQuery: string
    replaceDisabled: boolean
    searchQuery: string
    searchInputRef: React.RefObject<HTMLInputElement | null>
    wholeWord: boolean
  }
  searchActions: {
    closeSearch: () => void
    moveToMatch: (direction: 1 | -1) => void
    replaceAllMatches: () => void
    replaceCurrentMatch: () => void
    setReplaceQuery: (query: string) => void
    setSearchQuery: (query: string) => void
    toggleMatchCase: () => void
    toggleReplaceMode: () => void
    toggleWholeWord: () => void
  }
  citationStatus: string
  linkBubbleOwnerId: string
  linkBubbleActions: {
    dismissLinkBubble: () => void
    handleLinkSave: (href: string) => void
    handleLinkRemove: () => void
    handleLinkEditCancel: () => void
    handleLinkOpen: () => void
    handleLinkCopy: () => void
    setIsEditingLink: (editing: boolean) => void
  }
  onToggleLink: () => void
  onImagePick: () => void
  onEmojiPick: (menu: SlashMenuState) => void
  onCloseEmojiMenu: () => void
  onOpenAnnotationPopover: () => void
  onCancelAnnotationPopover: () => void
  onSubmitAnnotation: (body: string) => Promise<void>
  onCopyReviewNotes: () => void
  onCopyReviewNote: (note: MarkdownReviewNote) => void
  onToggleReviewRail: () => void
  onReviewNotesDelivered: (notes: readonly MarkdownReviewNote[]) => void
  onReviewNoteSourceClick: (comment: DiffComment) => void
  onDeleteReviewComment: (commentId: string) => void
  onSubmitReviewCommentEdit: (commentId: string, body: string) => Promise<boolean>
  onReviewNoteContentResize: () => void
  onNavigateTableOfContentsItem: (id: string) => void
  onCloseTableOfContents?: () => void
}

export function RichMarkdownEditorSurface({
  editor,
  editorFontZoomLevel,
  rootElement,
  rootRef,
  isModifierHeld,
  scrollContainerRef,
  headerSlot,
  reviewRailExpanded,
  reviewRailVisible,
  notePositions,
  activeReviewCommentId,
  attentionReviewCommentId,
  copiedReviewNoteId,
  markdownReviewContent,
  worktreeId,
  filePath,
  markdownCommentsCount,
  reviewRailOpen,
  reviewNotesCopied,
  unsentMarkdownReviewScope,
  linkBubble,
  isEditingLink,
  slashMenu,
  filteredSlashCommands,
  selectedCommandIndex,
  emojiMenu,
  docLinkMenu,
  docLinkRows,
  docLinkTotalMatches,
  selectedDocLinkIndex,
  annotationTarget,
  annotationPopover,
  markdownSourceLineOffset,
  tableOfContentsItems,
  showTableOfContents,
  searchState,
  searchActions,
  citationStatus,
  linkBubbleOwnerId,
  linkBubbleActions,
  onToggleLink,
  onImagePick,
  onEmojiPick,
  onCloseEmojiMenu,
  onOpenAnnotationPopover,
  onCancelAnnotationPopover,
  onSubmitAnnotation,
  onCopyReviewNotes,
  onCopyReviewNote,
  onToggleReviewRail,
  onReviewNotesDelivered,
  onReviewNoteSourceClick,
  onDeleteReviewComment,
  onSubmitReviewCommentEdit,
  onReviewNoteContentResize,
  onNavigateTableOfContentsItem,
  onCloseTableOfContents
}: RichMarkdownEditorSurfaceProps): React.JSX.Element {
  return (
    <div
      // Why: `rich-markdown-editor-layout` stays a stable hook for the
      // `:has(.markdown-toc-panel)` coupling in rich-markdown-content.css —
      // the TOC panel is a sibling component with no shared JSX to carry
      // that border color.
      className="rich-markdown-editor-layout bg-background [container-type:inline-size] relative flex h-full min-h-0 min-w-0"
    >
      {showTableOfContents ? (
        <MarkdownTableOfContentsPanel
          items={tableOfContentsItems}
          onClose={onCloseTableOfContents ?? (() => {})}
          onNavigate={onNavigateTableOfContentsItem}
        />
      ) : null}
      <div
        ref={rootRef}
        // Why: `rich-markdown-editor-shell` and `has-rich-markdown-review-notes`
        // stay stable hooks for the review-rail padding coupling in
        // rich-markdown-content.css and for the mod-held-class/closest()
        // lookups elsewhere in this feature.
        className={cn(
          'rich-markdown-editor-shell relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background',
          reviewRailExpanded && 'has-rich-markdown-review-notes',
          isModifierHeld && 'rich-markdown-mod-held'
        )}
        style={{ '--editor-font-zoom-level': editorFontZoomLevel } as React.CSSProperties}
      >
        <RichMarkdownToolbar
          editor={editor}
          onToggleLink={onToggleLink}
          onImagePick={onImagePick}
        />
        {headerSlot}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollContainerRef}
            className="scrollbar-editor relative h-full overflow-auto"
            onMouseDown={(event) => {
              if (!shouldFocusEmptyEditorFromSurfaceClick(event, editor)) {
                return
              }
              // Why: native contenteditable only places the caret on actual line
              // boxes; an empty note should still focus from blank document space.
              event.preventDefault()
              editor?.commands.focus('start')
            }}
          >
            <EditorContent editor={editor} />
            {reviewRailVisible && notePositions.length > 0 ? (
              <RichMarkdownReviewNoteLayer
                positions={notePositions}
                activeCommentId={activeReviewCommentId}
                attentionCommentId={attentionReviewCommentId}
                copiedCommentId={copiedReviewNoteId}
                markdownReviewContent={markdownReviewContent}
                worktreeId={worktreeId}
                filePath={filePath}
                onCopyNote={onCopyReviewNote}
                onScrollSourceIntoView={onReviewNoteSourceClick}
                onDeleteComment={onDeleteReviewComment}
                onSubmitEdit={onSubmitReviewCommentEdit}
                onContentResize={onReviewNoteContentResize}
                onDelivered={onReviewNotesDelivered}
              />
            ) : null}
          </div>
          <RichMarkdownSearchBar
            activeMatchIndex={searchState.activeMatchIndex}
            isOpen={searchState.isSearchOpen}
            isReplaceMode={searchState.isReplaceMode}
            matchCase={searchState.matchCase}
            matchCount={searchState.matchCount}
            query={searchState.searchQuery}
            replaceQuery={searchState.replaceQuery}
            replaceDisabled={searchState.replaceDisabled}
            searchInputRef={searchState.searchInputRef}
            wholeWord={searchState.wholeWord}
            onClose={searchActions.closeSearch}
            onMoveToMatch={searchActions.moveToMatch}
            onQueryChange={searchActions.setSearchQuery}
            onReplaceAll={searchActions.replaceAllMatches}
            onReplaceCurrent={searchActions.replaceCurrentMatch}
            onReplaceQueryChange={searchActions.setReplaceQuery}
            onToggleMatchCase={searchActions.toggleMatchCase}
            onToggleReplaceMode={searchActions.toggleReplaceMode}
            onToggleWholeWord={searchActions.toggleWholeWord}
          />
        </div>
        {linkBubble ? (
          <RichMarkdownLinkBubble
            anchorElement={rootElement}
            linkBubble={linkBubble}
            isEditing={isEditingLink}
            onDismiss={linkBubbleActions.dismissLinkBubble}
            portalToDocument
            onSave={linkBubbleActions.handleLinkSave}
            onRemove={linkBubbleActions.handleLinkRemove}
            onEditStart={() => linkBubbleActions.setIsEditingLink(true)}
            onEditCancel={linkBubbleActions.handleLinkEditCancel}
            onOpen={linkBubbleActions.handleLinkOpen}
            onCopy={linkBubbleActions.handleLinkCopy}
            ownerId={linkBubbleOwnerId}
          />
        ) : null}
        <span className="sr-only" role="status" aria-live="polite">
          {citationStatus}
        </span>
        {slashMenu ? (
          <RichMarkdownSlashMenu
            editor={editor}
            slashMenu={slashMenu}
            filteredCommands={filteredSlashCommands}
            selectedIndex={selectedCommandIndex}
            onImagePick={onImagePick}
            onEmojiPick={() => onEmojiPick(slashMenu)}
          />
        ) : null}
        {emojiMenu ? (
          <RichMarkdownEmojiMenu
            editor={editor}
            left={emojiMenu.left}
            top={emojiMenu.top}
            onClose={onCloseEmojiMenu}
          />
        ) : null}
        {docLinkMenu ? (
          <RichMarkdownDocLinkMenu
            editor={editor}
            menu={docLinkMenu}
            rows={docLinkRows}
            totalMatches={docLinkTotalMatches}
            selectedIndex={selectedDocLinkIndex}
          />
        ) : null}
        <RichMarkdownAnnotationOverlay
          target={annotationTarget}
          popover={annotationPopover}
          markdownSourceLineOffset={markdownSourceLineOffset}
          onOpenPopover={onOpenAnnotationPopover}
          onCancelPopover={onCancelAnnotationPopover}
          onSubmit={onSubmitAnnotation}
        />
        {markdownCommentsCount > 0 ? (
          <RichMarkdownReviewRailActions
            worktreeId={worktreeId}
            filePath={filePath}
            noteCount={markdownCommentsCount}
            railOpen={reviewRailOpen}
            notesCopied={reviewNotesCopied}
            unsentScope={unsentMarkdownReviewScope}
            onToggleRail={onToggleReviewRail}
            onCopyNotes={onCopyReviewNotes}
            onDelivered={onReviewNotesDelivered}
          />
        ) : null}
      </div>
    </div>
  )
}
