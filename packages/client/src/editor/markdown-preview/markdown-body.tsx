import type { MarkdownDocument } from '@agentstart/protocol/files/values'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import React from 'react'
import type { ComponentProps, RefObject } from 'react'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkBreaks from 'remark-breaks'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { translate } from '~renderer/i18n/i18n'
import type { AppState } from '~renderer/store/state'

import type { HttpLinkSourceOwner } from '../http-link-routing'
import { remarkMarkdownDocLinks } from '../markdown-doc-links'
import type { useLocalImageSrc } from '../use-local-image-src'
import type { MarkdownPreviewLinkContext } from './link'
import {
  createMarkdownPreviewComponents,
  type CreateMarkdownPreviewComponentsOptions
} from './renderers'
import { markdownPreviewSanitizeSchema } from './sanitize-schema'
import { markdownPreviewUrlTransform } from './url-transform'

const MARKDOWN_REMARK_PLUGINS: NonNullable<ComponentProps<typeof Markdown>['remarkPlugins']> = [
  remarkGfm,
  remarkBreaks,
  remarkFrontmatter,
  remarkMath,
  remarkMarkdownDocLinks
]
const MARKDOWN_REHYPE_PLUGINS: NonNullable<ComponentProps<typeof Markdown>['rehypePlugins']> = [
  rehypeRaw,
  [rehypeSanitize, markdownPreviewSanitizeSchema],
  rehypeSlug,
  rehypeHighlight,
  rehypeKatex
]

type MarkdownBodyProps = {
  activateMarkdownLink: AppState['activateMarkdownLink']
  bodyRef: RefObject<HTMLDivElement | null>
  filePath: string
  frontMatterInner: string
  handleAnnotatedMarkdownBlockClick: CreateMarkdownPreviewComponentsOptions['handleAnnotatedMarkdownBlockClick']
  imageRuntimeContext: Parameters<typeof useLocalImageSrc>[3]
  isDark: boolean
  isFrontMatterVisible: boolean
  isMac: boolean
  markdownDocumentIndex: MarkdownPreviewLinkContext['markdownDocumentIndex']
  onOpenDocument?: (
    document: MarkdownDocument,
    options?: { anchor?: string | null }
  ) => void | Promise<void>
  openFile: AppState['openFile']
  openMarkdownPreview: AppState['openMarkdownPreview']
  pendingEditorRevealFrameIdsRef: MarkdownPreviewLinkContext['pendingEditorRevealFrameIdsRef']
  renderAnnotationControls: CreateMarkdownPreviewComponentsOptions['renderAnnotationControls']
  renderedContent: string
  resolvedSourceRuntimeEnvironmentId: string | null | undefined
  reviewRevision: string
  scrollToAnchor: (anchor: string) => boolean
  setMarkdownViewMode: AppState['setMarkdownViewMode']
  setPendingEditorReveal: AppState['setPendingEditorReveal']
  sourceConnectionId: string | null | undefined
  sourceOwner: HttpLinkSourceOwner
  sourceRoutingWorktreeId: string | null
  sourceWorktree: Worktree | null
  worktreeRoot: string | null
  worktreesByRepo: Record<string, Worktree[]>
  wrapAnnotatedBlock: CreateMarkdownPreviewComponentsOptions['wrapAnnotatedBlock']
}

export const MarkdownBody = React.memo(function MarkdownBody(
  props: MarkdownBodyProps
): React.JSX.Element {
  const { bodyRef, frontMatterInner, isFrontMatterVisible, renderedContent, reviewRevision } = props
  const components = createMarkdownPreviewComponents({
    handleAnnotatedMarkdownBlockClick: props.handleAnnotatedMarkdownBlockClick,
    imageRuntimeContext: props.imageRuntimeContext,
    isDark: props.isDark,
    linkContext: createLinkContext(props),
    renderAnnotationControls: props.renderAnnotationControls,
    wrapAnnotatedBlock: props.wrapAnnotatedBlock
  })
  void reviewRevision

  return (
    <div ref={bodyRef} className="markdown-body" translate="no">
      {isFrontMatterVisible ? (
        <div className="border-border/60 bg-muted/40 mb-4 rounded border px-3 py-2">
          <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
            {translate('auto.components.editor.MarkdownPreview.2b2b31382c', 'Front Matter')}
          </div>
          <pre className="text-muted-foreground scrollbar-editor max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {frontMatterInner}
          </pre>
        </div>
      ) : null}
      <Markdown
        components={components}
        urlTransform={markdownPreviewUrlTransform}
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
      >
        {renderedContent}
      </Markdown>
    </div>
  )
})

function createLinkContext(props: MarkdownBodyProps): MarkdownPreviewLinkContext {
  return {
    activateMarkdownLink: props.activateMarkdownLink,
    filePath: props.filePath,
    isMac: props.isMac,
    markdownDocumentIndex: props.markdownDocumentIndex,
    onOpenDocument: props.onOpenDocument,
    openFile: props.openFile,
    openMarkdownPreview: props.openMarkdownPreview,
    pendingEditorRevealFrameIdsRef: props.pendingEditorRevealFrameIdsRef,
    resolvedSourceRuntimeEnvironmentId: props.resolvedSourceRuntimeEnvironmentId,
    scrollToAnchor: props.scrollToAnchor,
    setMarkdownViewMode: props.setMarkdownViewMode,
    setPendingEditorReveal: props.setPendingEditorReveal,
    sourceConnectionId: props.sourceConnectionId,
    sourceOwner: props.sourceOwner,
    sourceRoutingWorktreeId: props.sourceRoutingWorktreeId,
    sourceWorktree: props.sourceWorktree,
    worktreeRoot: props.worktreeRoot,
    worktreesByRepo: props.worktreesByRepo
  }
}
