import type { Tab } from '@yiru/protocol/workspace/tabs'
import type { AppState } from '~renderer/store/types'

import type {
  RuntimeMobileSessionFileTab,
  RuntimeMobileSessionMarkdownTab
} from './remote-session/session-model'
import { isUnifiedTabActiveInActiveGroup } from './runtime-mobile-tab-activity'

export type OpenFileByWorktreeAndId = Map<string, Map<string, AppState['openFiles'][number]>>

export function buildMobileMarkdownTab(
  state: AppState,
  openFileByWorktreeAndId: OpenFileByWorktreeAndId,
  editorDraftVersionByFileId: ReadonlyMap<string, string>,
  file: AppState['openFiles'][number],
  unifiedTab?: Tab
): RuntimeMobileSessionMarkdownTab | null {
  if (file.mode !== 'edit' && file.mode !== 'markdown-preview') {
    return null
  }
  if (file.language !== 'markdown' && file.mode !== 'markdown-preview') {
    return null
  }

  const sourceFile =
    file.mode === 'markdown-preview' && file.markdownPreviewSourceFileId
      ? (openFileByWorktreeAndId.get(file.worktreeId)?.get(file.markdownPreviewSourceFileId) ??
        file)
      : file
  const draftVersion = editorDraftVersionByFileId.get(sourceFile.id)
  const title = file.relativePath.split(/[\\/]/).pop() || file.relativePath || 'Markdown'
  const unifiedTabId = unifiedTab?.id

  return {
    type: 'markdown',
    id: unifiedTabId ?? file.id,
    title,
    filePath: file.filePath,
    relativePath: file.relativePath,
    language: 'markdown',
    mode: file.mode,
    isDirty: file.isDirty || sourceFile.isDirty,
    isActive: unifiedTabId
      ? isUnifiedTabActiveInActiveGroup(state, file.worktreeId, unifiedTabId)
      : isFileActiveEditorSurface(state, file),
    sourceFileId: sourceFile.id,
    sourceFilePath: sourceFile.filePath,
    sourceRelativePath: sourceFile.relativePath,
    documentVersion: draftVersion ?? `file:${sourceFile.id}`,
    color: unifiedTab?.color ?? null,
    isPinned: unifiedTab?.isPinned === true
  }
}

export function buildMobileFileTab(
  state: AppState,
  file: AppState['openFiles'][number],
  unifiedTab?: Tab
): RuntimeMobileSessionFileTab {
  const title = file.relativePath.split(/[\\/]/).pop() || file.relativePath || 'File'
  const diffSource = isMobileFileDiffSource(file.diffSource) ? file.diffSource : undefined
  const unifiedTabId = unifiedTab?.id

  return {
    type: 'file',
    id: unifiedTabId ?? file.id,
    title,
    filePath: file.filePath,
    relativePath: file.relativePath,
    language: file.language,
    mode: file.mode === 'diff' ? 'diff' : 'edit',
    ...(diffSource ? { diffSource } : {}),
    isDirty: file.isDirty,
    color: unifiedTab?.color ?? null,
    isPinned: unifiedTab?.isPinned === true,
    isActive: unifiedTabId
      ? isUnifiedTabActiveInActiveGroup(state, file.worktreeId, unifiedTabId)
      : isFileActiveEditorSurface(state, file)
  }
}

function isFileActiveEditorSurface(
  state: Pick<
    AppState,
    'activeFileId' | 'activeFileIdByWorktree' | 'activeTabType' | 'activeTabTypeByWorktree'
  >,
  file: Pick<AppState['openFiles'][number], 'id' | 'worktreeId'>
): boolean {
  const activeType = state.activeTabTypeByWorktree?.[file.worktreeId] ?? state.activeTabType
  return (
    activeType === 'editor' &&
    (state.activeFileIdByWorktree?.[file.worktreeId] ?? state.activeFileId) === file.id
  )
}

function isMobileFileDiffSource(
  diffSource: AppState['openFiles'][number]['diffSource']
): diffSource is 'staged' | 'unstaged' {
  return diffSource === 'staged' || diffSource === 'unstaged'
}

function isMobileUnsupportedCombinedDiffSource(
  diffSource: AppState['openFiles'][number]['diffSource']
): boolean {
  return (
    diffSource === 'combined-all' ||
    diffSource === 'combined-uncommitted' ||
    diffSource === 'combined-branch' ||
    diffSource === 'combined-commit'
  )
}

export function isMobilePublishableOpenFile(file: AppState['openFiles'][number]): boolean {
  // Why: combined diff tabs use display labels as relative paths and require
  // the desktop combined renderer; mobile would otherwise try files.read.
  return !isMobileUnsupportedCombinedDiffSource(file.diffSource)
}

export function stableHashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `draft:${value.length}:${(hash >>> 0).toString(16)}`
}
