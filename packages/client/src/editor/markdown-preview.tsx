import type { MarkdownDocument } from '@agentstart/protocol/files/values'
import React, { useEffect, useMemo, useRef } from 'react'
import { createConnectionIdForFileSelector } from '~renderer/editor/connection-owner-resolution'
import { isMarkdownComment } from '~renderer/editor/diff-comment-compat'

// Why: this component is the only lazy() boundary (content.tsx's
// `MarkdownPreview`) that mounts rehype-highlight's `.hljs-*` tree, the
// `.markdown-annotation-card` review states, and rehype-katex's rendered
// math, so their stylesheets ship in this chunk instead of main.css.
import './markdown.css'
import './markdown-review.css'
import 'katex/dist/katex.min.css'
import { computeEditorFontSize } from '~renderer/editor/font-zoom'
import type { HttpLinkSourceOwner } from '~renderer/editor/http-link-routing'
import { getShortcutPlatform } from '~renderer/keyboard-input/shortcut-platform'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'

import { createMarkdownDocumentIndex } from './markdown-doc-links'
import { extractFrontMatter } from './markdown-frontmatter'
import {
  getMarkdownAnnotationBlockKeyForSelection,
  isMarkdownPreviewAddReviewNoteShortcut
} from './markdown-preview/annotation-shortcut'
import { prewarmMarkdownPreviewLocalImages } from './markdown-preview/local-images'
import { MarkdownBody } from './markdown-preview/markdown-body'
import { isMarkdownPreviewFindShortcut } from './markdown-preview/search'
import {
  deriveMarkdownPreviewSourceRoot,
  findMarkdownPreviewSourceOpenFile,
  getMarkdownPreviewSourceRelativePath,
  resolveMarkdownPreviewSourceWorktree
} from './markdown-preview/source-model'
import { MarkdownPreviewSurface } from './markdown-preview/surface'
import { useMarkdownPreviewReview } from './markdown-preview/use-review'
import { useMarkdownPreviewScroll } from './markdown-preview/use-scroll'
import { useMarkdownPreviewSearch } from './markdown-preview/use-search'
import { selectMarkdownTableOfContents } from './markdown-toc-visibility-gate'
import { NotesSendMenu } from './notes-send-menu'
import { usePreserveSectionDuringExternalEdit } from './use-preserve-section-during-external-edit'

const EMPTY_MARKDOWN_DOCUMENTS: MarkdownDocument[] = []
const NOOP = (): void => {}

// Why: shared by the copy-notes button and the NotesSendMenu trigger (both
// render a variant="quiet" Button) so the two review-toolbar icon actions
// render identical chrome.
const MARKDOWN_REVIEW_ICON_BUTTON_CLASS_NAME =
  'inline-flex size-[26px] items-center justify-center border border-transparent hover:border-border/82 aria-expanded:border-border/82 aria-expanded:bg-accent aria-expanded:text-foreground'

type MarkdownPreviewProps = {
  content: string
  filePath: string
  sourceFileId?: string | null
  sourceWorktreeId?: string | null
  sourceRuntimeEnvironmentId?: string | null
  scrollCacheKey: string
  initialAnchor?: string | null
  showTableOfContents?: boolean
  onCloseTableOfContents?: () => void
  markdownDocuments?: MarkdownDocument[]
  onOpenDocument?: (
    document: MarkdownDocument,
    options?: { anchor?: string | null }
  ) => void | Promise<void>
  markdownAnnotationsEnabled?: boolean
}

export default function MarkdownPreview({
  content,
  filePath,
  sourceFileId = null,
  sourceWorktreeId = null,
  sourceRuntimeEnvironmentId = undefined,
  scrollCacheKey,
  initialAnchor = null,
  showTableOfContents = false,
  onCloseTableOfContents,
  markdownDocuments = EMPTY_MARKDOWN_DOCUMENTS,
  onOpenDocument,
  markdownAnnotationsEnabled = false
}: MarkdownPreviewProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pendingEditorRevealFrameIdsRef = useRef<number[]>([])
  const isMac = navigator.userAgent.includes('Mac')
  const openFile = useAppStore((s) => s.openFile)
  const activateMarkdownLink = useAppStore((s) => s.activateMarkdownLink)
  const openMarkdownPreview = useAppStore((s) => s.openMarkdownPreview)
  const setMarkdownViewMode = useAppStore((s) => s.setMarkdownViewMode)
  const frontmatterVisibleByFile = useAppStore((s) => s.markdownFrontmatterVisible)
  const setPendingEditorReveal = useAppStore((s) => s.setPendingEditorReveal)
  const keybindings = useAppStore((s) => s.keybindings)
  const { worktreesByRepo } = useProjectCatalog()
  const sourceOpenFile = useAppStore((s) =>
    findMarkdownPreviewSourceOpenFile(s.openFiles, {
      sourceFileId,
      filePath,
      sourceWorktreeId,
      sourceRuntimeEnvironmentId
    })
  )
  const resolvedSourceWorktreeId = sourceWorktreeId ?? sourceOpenFile?.worktreeId ?? null
  const resolvedSourceRuntimeEnvironmentId =
    sourceRuntimeEnvironmentId !== undefined
      ? sourceRuntimeEnvironmentId
      : sourceOpenFile?.runtimeEnvironmentId
  const sourceWorktree = resolveMarkdownPreviewSourceWorktree(
    worktreesByRepo,
    resolvedSourceWorktreeId,
    filePath
  )
  const allDiffComments = sourceWorktree?.diffComments
  const sourceRoutingWorktreeId = sourceWorktree?.id ?? resolvedSourceWorktreeId
  const runtimeOwnerId = resolvedSourceRuntimeEnvironmentId?.trim()
  const sourceConnectionIdSelector = (() =>
    createConnectionIdForFileSelector(sourceRoutingWorktreeId, filePath, {
      skip: Boolean(runtimeOwnerId)
    }))()
  const sourceConnectionId = useAppStore(sourceConnectionIdSelector)
  const sourceOwner = useMemo<HttpLinkSourceOwner>(
    () =>
      runtimeOwnerId
        ? { kind: 'runtime', runtimeEnvironmentId: runtimeOwnerId }
        : sourceConnectionId === undefined
          ? { kind: 'unknown' }
          : sourceConnectionId === null
            ? { kind: 'local' }
            : { kind: 'ssh', connectionId: sourceConnectionId },
    [runtimeOwnerId, sourceConnectionId]
  )
  const worktreeRoot =
    sourceWorktree?.path ??
    (sourceRoutingWorktreeId
      ? deriveMarkdownPreviewSourceRoot(filePath, sourceOpenFile?.relativePath)
      : null)
  const sourceRelativePath = (() => {
    if (!sourceWorktree) {
      return null
    }
    return getMarkdownPreviewSourceRelativePath(filePath, sourceWorktree.path)
  })()
  const markdownComments = useMemo(
    () =>
      (allDiffComments ?? []).filter(
        (comment) => comment.filePath === sourceRelativePath && isMarkdownComment(comment)
      ),
    [allDiffComments, sourceRelativePath]
  )
  const settings = useAppStore((s) => s.settings)
  const imageRuntimeContext = useMemo(
    () =>
      sourceRoutingWorktreeId && worktreeRoot
        ? {
            settings: settingsForRuntimeOwner(settings, resolvedSourceRuntimeEnvironmentId),
            worktreeId: sourceRoutingWorktreeId,
            worktreePath: worktreeRoot,
            connectionId: sourceConnectionId
          }
        : undefined,
    [
      resolvedSourceRuntimeEnvironmentId,
      settings,
      sourceConnectionId,
      sourceRoutingWorktreeId,
      worktreeRoot
    ]
  )
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const editorFontSize = computeEditorFontSize(14, editorFontZoomLevel)
  const isDark =
    settings?.theme === 'dark' ||
    (settings?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const renderedContent = usePreserveSectionDuringExternalEdit(content, bodyRef)
  const {
    activeMatchIndex,
    closeSearch,
    inputRef,
    isSearchOpen,
    matchCount,
    moveToMatch,
    openSearch,
    query,
    setQuery,
    setSearchInputElement
  } = useMarkdownPreviewSearch({ bodyRef, renderedContent })
  const { navigateToTableOfContentsItem, scrollToAnchor } = useMarkdownPreviewScroll({
    bodyRef,
    content,
    initialAnchor,
    renderedContent,
    rootRef,
    scrollCacheKey
  })

  useEffect(() => {
    const prewarm = prewarmMarkdownPreviewLocalImages(renderedContent, filePath, {
      runtimeContext: imageRuntimeContext
    })
    return prewarm.cancel
  }, [renderedContent, filePath, imageRuntimeContext])

  const frontMatter = (() => extractFrontMatter(renderedContent))()
  // Why: building the table of contents runs a full-document remark parse on
  // every content change, and the preview's content churns on streamed/external
  // file writes. The result is only used while the panel is open (closed by
  // default), so gate the parse on visibility; showTableOfContents in the deps
  // rebuilds the outline the moment it opens.
  const tableOfContentsItems = (() =>
    selectMarkdownTableOfContents(showTableOfContents, renderedContent))()
  const markdownDocumentIndex = useMemo(
    () => createMarkdownDocumentIndex(markdownDocuments),
    [markdownDocuments]
  )
  const frontMatterInner = (() => {
    if (!frontMatter) {
      return ''
    }
    return frontMatter.raw
      .replace(/^(?:---|\+\+\+)\r?\n/, '')
      .replace(/\r?\n(?:---|\+\+\+)\r?\n?$/, '')
      .trim()
  })()
  // Why: front matter shows by default and is toggled off from the markdown
  // preview actions menu; the store map only carries per-file hide overrides.
  const toggleableSourceFileId: string | null = sourceFileId ?? null
  const frontmatterVisible = toggleableSourceFileId
    ? (frontmatterVisibleByFile[toggleableSourceFileId] ?? true)
    : true
  const {
    bodyRevision,
    canShowReviewTools,
    copyReviewNotes,
    handleAnnotatedMarkdownBlockClick,
    markdownReviewNotes,
    onDelivered: handleReviewNotesDelivered,
    openAnnotationBlock,
    renderAnnotationControls,
    reviewNotesCopied,
    scrollToReviewNote,
    setRootElement,
    unsentReviewScope,
    wrapAnnotatedBlock
  } = useMarkdownPreviewReview({
    content,
    filePath,
    markdownAnnotationsEnabled,
    markdownComments,
    pendingEditorRevealFrameIdsRef,
    renderedContent,
    rootRef,
    sourceRelativePath,
    sourceWorktree
  })
  const handleAnnotatedMarkdownBlockClickEvent = useEventCallback(handleAnnotatedMarkdownBlockClick)
  const renderAnnotationControlsEvent = useEventCallback(renderAnnotationControls)
  const wrapAnnotatedBlockEvent = useEventCallback(wrapAnnotatedBlock)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const root = rootRef.current
      if (!root) {
        return
      }

      const target = event.target
      const targetInsidePreview = target instanceof Node && root.contains(target)

      if (
        isMarkdownPreviewFindShortcut(event, getShortcutPlatform(), keybindings) &&
        targetInsidePreview
      ) {
        event.preventDefault()
        event.stopPropagation()
        openSearch()
        return
      }

      if (
        isMarkdownPreviewAddReviewNoteShortcut(event, getShortcutPlatform(), keybindings) &&
        targetInsidePreview &&
        markdownAnnotationsEnabled
      ) {
        const blockKey = getMarkdownAnnotationBlockKeyForSelection(root, window.getSelection())
        if (blockKey) {
          event.preventDefault()
          event.stopPropagation()
          openAnnotationBlock(blockKey)
        }
        return
      }

      if (!isSearchOpen) {
        return
      }

      if (event.key === 'Escape' && (targetInsidePreview || target === inputRef.current)) {
        event.preventDefault()
        event.stopPropagation()
        closeSearch()
        root.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [
    closeSearch,
    inputRef,
    isSearchOpen,
    keybindings,
    markdownAnnotationsEnabled,
    openAnnotationBlock,
    openSearch
  ])

  const searchSurface = {
    activeMatchIndex,
    close: closeSearch,
    focusPreview: () => rootRef.current?.focus(),
    inputRef: setSearchInputElement,
    isOpen: isSearchOpen,
    matchCount,
    move: moveToMatch,
    query,
    setQuery
  }
  const reviewSurface = {
    count: markdownReviewNotes.length,
    isCopied: reviewNotesCopied,
    isVisible: canShowReviewTools,
    onCopy: () => void copyReviewNotes(),
    onJumpToFirst: () => {
      const firstNote = markdownReviewNotes[0]
      if (firstNote) {
        scrollToReviewNote(firstNote)
      }
    },
    sendMenu: sourceWorktree ? (
      <NotesSendMenu
        worktreeId={sourceWorktree.id}
        groupId={sourceWorktree.id}
        modeIdParts={['markdown-notes', sourceWorktree.id, filePath, 'preview-toolbar']}
        scopes={unsentReviewScope}
        triggerClassName={MARKDOWN_REVIEW_ICON_BUTTON_CLASS_NAME}
        onDelivered={handleReviewNotesDelivered}
      />
    ) : null
  }

  return (
    <MarkdownPreviewSurface
      body={
        <MarkdownBody
          activateMarkdownLink={activateMarkdownLink}
          bodyRef={bodyRef}
          filePath={filePath}
          frontMatterInner={frontMatterInner}
          handleAnnotatedMarkdownBlockClick={handleAnnotatedMarkdownBlockClickEvent}
          imageRuntimeContext={imageRuntimeContext}
          isDark={isDark}
          isFrontMatterVisible={Boolean(frontMatter && frontmatterVisible)}
          isMac={isMac}
          markdownDocumentIndex={markdownDocumentIndex}
          onOpenDocument={onOpenDocument}
          openFile={openFile}
          openMarkdownPreview={openMarkdownPreview}
          pendingEditorRevealFrameIdsRef={pendingEditorRevealFrameIdsRef}
          renderAnnotationControls={renderAnnotationControlsEvent}
          renderedContent={renderedContent}
          resolvedSourceRuntimeEnvironmentId={resolvedSourceRuntimeEnvironmentId}
          reviewRevision={String(bodyRevision)}
          scrollToAnchor={scrollToAnchor}
          setMarkdownViewMode={setMarkdownViewMode}
          setPendingEditorReveal={setPendingEditorReveal}
          sourceConnectionId={sourceConnectionId}
          sourceOwner={sourceOwner}
          sourceRoutingWorktreeId={sourceRoutingWorktreeId}
          sourceWorktree={sourceWorktree}
          worktreeRoot={worktreeRoot}
          worktreesByRepo={worktreesByRepo}
          wrapAnnotatedBlock={wrapAnnotatedBlockEvent}
        />
      }
      editorFontSize={editorFontSize}
      isDark={isDark}
      onCloseTableOfContents={onCloseTableOfContents ?? NOOP}
      onNavigateTableOfContents={navigateToTableOfContentsItem}
      review={reviewSurface}
      rootRef={setRootElement}
      search={searchSurface}
      showTableOfContents={showTableOfContents}
      tableOfContentsItems={tableOfContentsItems}
    />
  )
}
