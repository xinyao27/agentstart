import type { SearchFileResult, SearchMatch } from '@agentstart/protocol/files/values'
import { detectLanguage } from '~renderer/file-presentation/language-detect'

export function cancelRevealFrame(frameRef: React.RefObject<number | null>): void {
  if (frameRef.current !== null) {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }
}

export function openMatchResult(params: {
  activeWorktreeId: string
  fileResult: SearchFileResult
  match: SearchMatch
  openFile: (
    file: {
      filePath: string
      relativePath: string
      worktreeId: string
      language: string
      mode: 'edit'
    },
    options?: { preview?: boolean; workspacePanelTabId?: string }
  ) => void
  preview: boolean
  workspacePanelTabId?: string
  setPendingEditorReveal: (
    reveal: {
      filePath: string
      line: number
      column: number
      matchLength: number
    } | null
  ) => void
  revealRafRef: React.RefObject<number | null>
  revealInnerRafRef: React.RefObject<number | null>
}): void {
  const {
    activeWorktreeId,
    fileResult,
    match,
    openFile,
    preview,
    workspacePanelTabId,
    setPendingEditorReveal,
    revealRafRef,
    revealInnerRafRef
  } = params

  openFile(
    {
      filePath: fileResult.filePath,
      relativePath: fileResult.relativePath,
      worktreeId: activeWorktreeId,
      language: detectLanguage(fileResult.relativePath),
      mode: 'edit'
    },
    { preview, workspacePanelTabId }
  )

  cancelRevealFrame(revealRafRef)
  cancelRevealFrame(revealInnerRafRef)
  setPendingEditorReveal(null)

  // Why: opening a result can replace the active editor target and mount a
  // asynchronously. Matching terminal-link navigation, wait two frames so
  // the destination editor owns focus/layout before we ask it to reveal.
  revealRafRef.current = requestAnimationFrame(() => {
    revealInnerRafRef.current = requestAnimationFrame(() => {
      setPendingEditorReveal({
        filePath: fileResult.filePath,
        line: match.line,
        column: match.column,
        matchLength: match.matchLength
      })
      cancelRevealFrame(revealRafRef)
      cancelRevealFrame(revealInnerRafRef)
    })
  })
}
