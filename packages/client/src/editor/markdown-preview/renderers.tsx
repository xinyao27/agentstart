import React from 'react'
import type { Components } from 'react-markdown'

import CodeBlockCopyButton from '../code-block-copy-button'
import MermaidBlock from '../mermaid-block'
import { useLocalImageSrc } from '../use-local-image-src'
import {
  getMarkdownPreviewAnnotationQuote,
  getMarkdownPreviewBlockRange,
  hasMarkdownPreviewNestedBlock,
  type MarkdownPreviewPositionNode
} from './annotation-model'
import { createMarkdownPreviewLink, type MarkdownPreviewLinkContext } from './link'
import { isMarkdownPreviewOpenModifier } from './links'

type MarkdownBlockRange = { startLine: number; endLine: number }

export type CreateMarkdownPreviewComponentsOptions = {
  handleAnnotatedMarkdownBlockClick: (
    range: MarkdownBlockRange,
    event: React.MouseEvent<HTMLElement>
  ) => void
  imageRuntimeContext: Parameters<typeof useLocalImageSrc>[3]
  isDark: boolean
  linkContext: MarkdownPreviewLinkContext
  renderAnnotationControls: (
    range: MarkdownBlockRange,
    blockKey: string,
    annotationQuote?: string
  ) => React.ReactNode
  wrapAnnotatedBlock: (
    tagName: string,
    node: MarkdownPreviewPositionNode | undefined,
    rendered: React.ReactNode
  ) => React.ReactNode
}

type MarkdownPreviewImageProps = React.ComponentPropsWithoutRef<'img'> & {
  node?: unknown
  options: CreateMarkdownPreviewComponentsOptions
}

function MarkdownPreviewImage({
  node: _node,
  options,
  src,
  alt,
  ...props
}: MarkdownPreviewImageProps): React.JSX.Element {
  const {
    activateMarkdownLink,
    filePath,
    isMac,
    resolvedSourceRuntimeEnvironmentId,
    sourceOwner,
    sourceRoutingWorktreeId,
    worktreeRoot
  } = options.linkContext
  const resolvedSrc = useLocalImageSrc(src, filePath, undefined, options.imageRuntimeContext)
  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>): void => {
    if (!isMarkdownPreviewOpenModifier(event, isMac)) {
      return
    }

    if (!src || !sourceRoutingWorktreeId || !worktreeRoot) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    void activateMarkdownLink(src, {
      sourceFilePath: filePath,
      worktreeId: sourceRoutingWorktreeId,
      worktreeRoot,
      runtimeEnvironmentId: resolvedSourceRuntimeEnvironmentId,
      openInAgentStartBrowser: true,
      sourceOwner
    })
  }

  // Why: display uses IPC-backed blob URLs, but Cmd/Ctrl-click should open
  // the original markdown target so local and SSH worktree images route
  // through the same editor path as normal file links.
  return <img {...props} src={resolvedSrc} alt={alt ?? ''} onClick={handleImageClick} />
}

export function createMarkdownPreviewComponents({
  ...options
}: CreateMarkdownPreviewComponentsOptions): Components {
  return {
    a: createMarkdownPreviewLink(options.linkContext),
    img: (props) => <MarkdownPreviewImage {...props} options={options} />,
    // Why: Intercept code elements to detect mermaid fenced blocks. rehype-highlight
    // sets className="language-mermaid" on the <code> inside <pre> for ```mermaid blocks.
    // We render those as SVG diagrams instead of highlighted source. Markdown preview
    // opts out of Mermaid HTML labels because this path sanitizes the SVG before
    // injection, and sanitized foreignObject labels disappear on some platforms.
    code: ({ className, children, ...props }) => {
      if (/language-mermaid/.test(className || '')) {
        return (
          <MermaidBlock
            content={String(children).trimEnd()}
            isDark={options.isDark}
            htmlLabels={false}
          />
        )
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    },
    // Why: Wrap <pre> blocks with a positioned container so a copy button can
    // overlay the code block. Mermaid diagrams are detected and passed through
    // unwrapped — MermaidBlock renders via useEffect/innerHTML, not React children,
    // so CodeBlockCopyButton's extractText() would copy an empty string, and a
    // <div> inside <pre> produces invalid HTML.
    pre: ({ node, children, ...props }) => {
      const child = React.Children.toArray(children)[0]
      if (React.isValidElement(child) && child.type === MermaidBlock) {
        return <>{children}</>
      }
      return options.wrapAnnotatedBlock(
        'pre',
        node as MarkdownPreviewPositionNode,
        <CodeBlockCopyButton {...props}>{children}</CodeBlockCopyButton>
      )
    },
    p: ({ node, children, ...props }) =>
      options.wrapAnnotatedBlock(
        'p',
        node as MarkdownPreviewPositionNode,
        <p {...props}>{children}</p>
      ),
    blockquote: ({ node, children, ...props }) =>
      options.wrapAnnotatedBlock(
        'blockquote',
        node as MarkdownPreviewPositionNode,
        <blockquote {...props}>{children}</blockquote>
      ),
    table: ({ node, children, ...props }) =>
      options.wrapAnnotatedBlock(
        'table',
        node as MarkdownPreviewPositionNode,
        <table {...props}>{children}</table>
      ),
    li: ({ node, children, ...props }) => {
      const positionNode = node as MarkdownPreviewPositionNode
      const range = hasMarkdownPreviewNestedBlock(positionNode)
        ? null
        : getMarkdownPreviewBlockRange(positionNode)
      if (!range) {
        return <li {...props}>{children}</li>
      }
      const blockKey = `li:${range.startLine}-${range.endLine}`
      const controls = options.renderAnnotationControls(
        range,
        blockKey,
        getMarkdownPreviewAnnotationQuote(children)
      )
      return (
        <li {...props}>
          <div
            className="markdown-annotation-list-block group relative grid grid-cols-[minmax(0,1fr)_minmax(220px,min(28cqw,300px))] items-start gap-x-8 @max-[760px]/markdown-preview:block"
            data-source-line={range.startLine}
            data-source-end-line={range.endLine}
            // Why: only advertise the block to the add-review-note shortcut
            // when the composer can actually render (mirrors wrapAnnotatedBlock).
            data-annotation-block-key={controls ? blockKey : undefined}
            onClick={(event) => options.handleAnnotatedMarkdownBlockClick(range, event)}
          >
            <span className="markdown-annotation-list-content col-start-1 min-w-0">{children}</span>
            {controls}
          </div>
        </li>
      )
    },
    h1: ({ node, children, ...props }) => {
      return options.wrapAnnotatedBlock(
        'h1',
        node as MarkdownPreviewPositionNode,
        <h1 {...props} tabIndex={-1} className="outline-none">
          {children}
        </h1>
      )
    },
    h2: ({ node, children, ...props }) => {
      return options.wrapAnnotatedBlock(
        'h2',
        node as MarkdownPreviewPositionNode,
        <h2 {...props} tabIndex={-1} className="outline-none">
          {children}
        </h2>
      )
    },
    h3: ({ node, children, ...props }) => {
      return options.wrapAnnotatedBlock(
        'h3',
        node as MarkdownPreviewPositionNode,
        <h3 {...props} tabIndex={-1} className="outline-none">
          {children}
        </h3>
      )
    },
    h4: ({ node, children, ...props }) => {
      return options.wrapAnnotatedBlock(
        'h4',
        node as MarkdownPreviewPositionNode,
        <h4 {...props} tabIndex={-1} className="outline-none">
          {children}
        </h4>
      )
    },
    h5: ({ node, children, ...props }) => {
      return options.wrapAnnotatedBlock(
        'h5',
        node as MarkdownPreviewPositionNode,
        <h5 {...props} tabIndex={-1} className="outline-none">
          {children}
        </h5>
      )
    },
    h6: ({ node, children, ...props }) => {
      return options.wrapAnnotatedBlock(
        'h6',
        node as MarkdownPreviewPositionNode,
        <h6 {...props} tabIndex={-1} className="outline-none">
          {children}
        </h6>
      )
    }
  }
}
