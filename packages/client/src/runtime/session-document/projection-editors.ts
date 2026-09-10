import type { WorkspaceSessionState } from '@agentstart/protocol/workspace/session'
import { buildOwnedEditorFileId } from '~renderer/editor/file-identity'
import type { OpenFile } from '~renderer/editor/file-model'
import type { AppState } from '~renderer/store/types'

export function projectSessionEditors(
  state: AppState,
  session: WorkspaceSessionState,
  owns: (worktree: string) => boolean
): Pick<AppState, 'openFiles' | 'editorDrafts' | 'activeFileIdByWorktree'> {
  const openFiles = state.openFiles.filter((file) => !owns(file.worktreeId) || file.mode !== 'edit')
  const editorDrafts = { ...state.editorDrafts }
  const activeFileIdByWorktree = { ...state.activeFileIdByWorktree }
  for (const old of state.openFiles) {
    if (owns(old.worktreeId) && old.mode === 'edit') {
      delete editorDrafts[old.id]
    }
  }
  for (const [worktree, files] of Object.entries(session.openFilesByWorktree ?? {})) {
    if (!owns(worktree)) {
      continue
    }
    for (const file of files) {
      const prior = state.openFiles.find(
        (old) =>
          old.worktreeId === worktree &&
          old.mode === 'edit' &&
          old.filePath === file.filePath &&
          (old.runtimeEnvironmentId ?? null) === (file.runtimeEnvironmentId ?? null)
      )
      const id =
        prior?.id ??
        (file.runtimeEnvironmentId || openFiles.some((old) => old.id === file.filePath)
          ? buildOwnedEditorFileId(file.filePath, worktree, file.runtimeEnvironmentId)
          : file.filePath)
      const draft = file.readOnly ? undefined : file.dirtyDraftContent
      const next: OpenFile = {
        ...prior,
        id,
        filePath: file.filePath,
        relativePath: file.relativePath,
        worktreeId: worktree,
        language: file.language,
        mode: 'edit',
        isDirty: draft !== undefined,
        readOnly: file.readOnly,
        liveTail: file.liveTail,
        runtimeEnvironmentId: file.runtimeEnvironmentId,
        lastKnownDiskSignature: file.lastKnownDiskSignature,
        isPreview: file.isPreview
      }
      if (!prior && draft !== undefined && file.lastKnownDiskSignature !== undefined) {
        next.pendingDiskBaselineVerification = true
      }
      openFiles.push(next)
      if (draft !== undefined) {
        editorDrafts[id] = draft
      }
    }
  }
  for (const worktree of new Set([
    ...Object.keys(state.activeFileIdByWorktree),
    ...Object.keys(session.openFilesByWorktree ?? {})
  ])) {
    if (!owns(worktree)) {
      continue
    }
    const active = state.activeFileIdByWorktree[worktree]
    activeFileIdByWorktree[worktree] = openFiles.some(
      (file) => file.worktreeId === worktree && file.id === active
    )
      ? active
      : (openFiles.find((file) => file.worktreeId === worktree)?.id ?? null)
  }
  return { openFiles, editorDrafts, activeFileIdByWorktree }
}
