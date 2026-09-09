import type { CodeViewFileItem, LineAnnotation } from '@pierre/diffs'
import { CodeView, type CodeViewHandle, type CodeViewReactOptions } from '@pierre/diffs/react'
import type { DiffComment } from '@yiru/protocol/git/diff-review'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { selectWorktreeDiffComments } from '~renderer/diff-comments/worktree-selector'
import { useAppStore } from '~renderer/store/state'

import { registerCursorPierreThemes } from './cursor-theme/pierre'
import {
  buildDiffCodeViewFileAnnotations,
  renderDiffCodeViewAnnotation,
  type DiffCodeViewAnnotation,
  type DiffCodeViewComposer
} from './diff-code-view/annotations'
import { DiffCodeViewEditProvider } from './diff-code-view/edit-provider'
import {
  buildDiffCodeViewCSSVariables,
  buildDiffCodeViewRenderOptions
} from './diff-code-view/options'
import { isDiffComment } from './diff-comment-compat'
import { resolveDocumentTheme } from './document-theme'
import { resolveEditorFontFamily } from './font-family'
import { computeEditorFontSize } from './font-zoom'
import { resolvePierreDiffLanguage } from './pierre-diff-language'

export type FileCodeViewProps = {
  fileId: string
  filePath: string
  viewStateKey: string
  relativePath: string
  content: string
  language: string
  onContentChange: (content: string) => void
  onSave: (content: string) => void
  revealLine?: number
  worktreeId?: string
  readOnly?: boolean
  liveTail?: boolean
}

registerCursorPierreThemes()

function createFileCodeViewItemController(): {
  getEditedContent: () => string
  recordEdit: (content: string) => void
  resolveItems: (input: {
    annotations: LineAnnotation<DiffCodeViewAnnotation>[]
    content: string
    fileId: string
    pierreLanguage: string
    readOnly: boolean
    relativePath: string
    viewStateKey: string
  }) => CodeViewFileItem<DiffCodeViewAnnotation>[]
} {
  let editedContent: string | null = null
  let version = 0
  let previous: {
    annotations: LineAnnotation<DiffCodeViewAnnotation>[]
    content: string
    readOnly: boolean
  } | null = null
  return {
    getEditedContent: () => editedContent ?? '',
    recordEdit: (content) => {
      editedContent = content
    },
    resolveItems: (input) => {
      editedContent ??= input.content
      const hasContentChanged = previous !== null && previous.content !== input.content
      const hasExternalContentChanged = hasContentChanged && editedContent !== input.content
      if (
        previous &&
        (hasExternalContentChanged ||
          previous.annotations !== input.annotations ||
          previous.readOnly !== input.readOnly)
      ) {
        version += 1
      }
      if (hasExternalContentChanged) {
        editedContent = input.content
      }
      previous = {
        content: input.content,
        annotations: input.annotations,
        readOnly: input.readOnly
      }
      return [
        {
          id: input.fileId,
          type: 'file',
          file: {
            name: input.relativePath,
            contents: input.content,
            lang: input.pierreLanguage,
            cacheKey: `${input.viewStateKey}:${version}`
          },
          annotations: input.annotations,
          edit: !input.readOnly,
          version
        }
      ]
    }
  }
}

/**
 * A single file, rendered and edited through Pierre.
 *
 * Why: CodeView is the app's one code surface. A file is the same virtualized
 * list with a single `file` item, so editing, comments, theming and scroll
 * behave identically here and in every diff.
 */
export default function FileCodeView({
  fileId,
  viewStateKey,
  relativePath,
  content,
  language,
  onContentChange,
  onSave,
  revealLine,
  worktreeId,
  readOnly = false,
  liveTail = false
}: FileCodeViewProps): React.JSX.Element {
  const handleRef = useRef<CodeViewHandle<DiffCodeViewAnnotation> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Why: the save shortcut needs the live document, and CodeView reports it
  // through onItemEditChange rather than exposing the editor's text.
  const [itemController] = useState(createFileCodeViewItemController)
  const [composer, setComposer] = useState<DiffCodeViewComposer | null>(null)

  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const setEditorCursorLine = useAppStore((s) => s.setEditorCursorLine)
  const deleteDiffComment = useAppStore((s) => s.deleteDiffComment)
  const updateDiffComment = useAppStore((s) => s.updateDiffComment)
  const addDiffComment = useAppStore((s) => s.addDiffComment)
  const allDiffComments = useAppStore((s): DiffComment[] | undefined =>
    selectWorktreeDiffComments(s, worktreeId)
  )
  const comments = useMemo(
    () =>
      (allDiffComments ?? []).filter(
        (comment) => comment.filePath === relativePath && isDiffComment(comment)
      ),
    [allDiffComments, relativePath]
  )

  const isDark = resolveDocumentTheme(settings?.theme ?? 'system')
  const fontSize = computeEditorFontSize(settings?.terminalFontSize ?? 13, editorFontZoomLevel)
  const pierreLanguage = (() => resolvePierreDiffLanguage(relativePath, language))()

  const annotations = useMemo(
    () => buildDiffCodeViewFileAnnotations(comments, composer),
    [comments, composer]
  )
  const items = itemController.resolveItems({
    annotations,
    content,
    fileId,
    pierreLanguage,
    readOnly,
    relativePath,
    viewStateKey
  })

  const options: CodeViewReactOptions<DiffCodeViewAnnotation> = {
    ...buildDiffCodeViewRenderOptions({
      isDark,
      sideBySide: false,
      wordWrap: settings?.editorWordWrap === true,
      disableFileHeader: true
    }),
    enableLineSelection: Boolean(worktreeId),
    enableGutterUtility: Boolean(worktreeId),
    lineHoverHighlight: worktreeId ? 'line' : 'disabled',
    onGutterUtilityClick: (range) => {
      setComposer({
        startLine: range.start === range.end ? undefined : Math.min(range.start, range.end),
        lineNumber: Math.max(range.start, range.end)
      })
    }
  }

  const style = (() =>
    buildDiffCodeViewCSSVariables({ fontSize, fontFamily: resolveEditorFontFamily(settings) }))()

  const handleSubmitComment = async (body: string) => {
    if (!composer || !worktreeId) {
      return
    }
    const saved = await addDiffComment({
      worktreeId,
      filePath: relativePath,
      source: 'diff',
      startLine: composer.startLine,
      lineNumber: composer.lineNumber,
      body,
      side: 'modified'
    })
    if (saved) {
      setComposer(null)
    }
  }

  const renderAnnotation = (annotation: LineAnnotation<DiffCodeViewAnnotation>) =>
    renderDiffCodeViewAnnotation(annotation, {
      relativePath,
      worktreeId,
      onCancelComposer: () => setComposer(null),
      onSubmitComposer: handleSubmitComment,
      onDeleteComment: worktreeId
        ? (commentId) => {
            void deleteDiffComment(worktreeId, commentId)
          }
        : undefined,
      onUpdateComment: worktreeId
        ? (commentId, body) => updateDiffComment(worktreeId, commentId, body)
        : undefined
    })

  const handleItemEditChange = (_item: { id: string }, editedFile: { contents: string }) => {
    itemController.recordEdit(editedFile.contents)
    onContentChange(editedFile.contents)
  }

  // Why: the surface owns Cmd/Ctrl+S because Pierre's editor deliberately ships
  // no command palette — the host decides what a keystroke means.
  useEffect(() => {
    const container = containerRef.current
    if (!container || readOnly) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isSaveChord = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
      if (!isSaveChord || event.key !== 's') {
        return
      }
      event.preventDefault()
      onSave(itemController.getEditedContent())
    }
    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [itemController, onSave, readOnly])

  useLayoutEffect(() => {
    if (revealLine === undefined) {
      return
    }
    handleRef.current?.scrollTo({
      type: 'line',
      id: fileId,
      lineNumber: revealLine,
      align: 'center'
    })
    setEditorCursorLine(fileId, revealLine)
  }, [fileId, revealLine, setEditorCursorLine])

  useLayoutEffect(() => {
    if (!liveTail) {
      return
    }
    // Why: a tailed file grows underneath the viewport; follow the last line so
    // new output stays on screen without the user chasing it.
    handleRef.current?.scrollTo({ type: 'position', position: Number.MAX_SAFE_INTEGER })
  }, [content, liveTail])

  return (
    <div data-editor-save-file-id={fileId} className="h-full min-h-0">
      <DiffCodeViewEditProvider>
        <CodeView<DiffCodeViewAnnotation>
          ref={handleRef}
          containerRef={containerRef}
          items={items}
          options={options}
          renderAnnotation={renderAnnotation}
          onItemEditChange={handleItemEditChange}
          className="scrollbar-editor bg-background h-full min-h-0 overflow-x-hidden overflow-y-auto"
          style={style}
        />
      </DiffCodeViewEditProvider>
    </div>
  )
}
