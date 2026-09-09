import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { joinPath } from '~renderer/path'
import { useAppStore } from '~renderer/store/state'

import { buildActiveOpenFileSignature, buildActiveOpenRowKeys } from '../active-open-file-keys'
import type { DropdownActionKind } from '../dropdown-items'
import { getNextSourceControlViewMode } from '../header-toolbar'
import {
  isSourceControlSplitOpenModifier,
  shouldOpenSourceControlRowAsPreview,
  type SourceControlRowOpenEvent
} from '../split-open'
import type { SourceControlActionModelController } from './action-model'

export function useSourceControlFileOpen(scope: SourceControlActionModelController) {
  const {
    activeGroupIdByWorktree,
    activeWorktreeId,
    createEmptySplitGroup,
    groupsByWorktree,
    handleAbortMerge,
    handleAbortRebase,
    handleCommit,
    handleCreatePullRequest,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isMac,
    openConflictFile,
    openDiff,
    prGenerating,
    runCompoundCommitAction,
    runCreatePrIntent,
    runRemoteAction,
    settings,
    sourceControlViewMode,
    trackConflictPath,
    updateSettings,
    visibleFileRowKeys,
    workspacePanelTabId,
    worktreePath
  } = scope
  const handleActionInvoke = (kind: DropdownActionKind): void => {
    if (prGenerating || isCreatingPr || isCreatePrIntentInFlight) {
      return
    }
    switch (kind) {
      case 'commit':
        void handleCommit()
        return
      case 'commit_push':
        void runCompoundCommitAction('push')
        return
      case 'commit_sync':
        void runCompoundCommitAction('sync')
        return
      case 'abort_merge':
        void handleAbortMerge()
        return
      case 'abort_rebase':
        void handleAbortRebase()
        return
      case 'create_pr':
        void handleCreatePullRequest()
        return
      case 'push_create_pr':
        void runCreatePrIntent()
        return
      case 'push':
      case 'force_push':
      case 'pull':
      case 'fast_forward':
      case 'sync':
      case 'fetch':
      case 'publish':
      case 'rebase_base':
        void runRemoteAction(kind === 'rebase_base' ? 'rebase' : kind)
    }
  }
  const resolveSplitTargetGroupId = (event?: SourceControlRowOpenEvent): string | undefined => {
    if (!event || !activeWorktreeId || !isSourceControlSplitOpenModifier(event, isMac)) {
      return undefined
    }
    const sourceGroupId =
      activeGroupIdByWorktree[activeWorktreeId] ?? groupsByWorktree[activeWorktreeId]?.[0]?.id
    if (!sourceGroupId) {
      return undefined
    }
    return createEmptySplitGroup(activeWorktreeId, sourceGroupId, 'right') ?? undefined
  }
  const activeOpenFileSignature = useAppStore((s) => {
    if (!activeWorktreeId) {
      return null
    }
    if (s.activeTabTypeByWorktree?.[activeWorktreeId] !== 'editor') {
      return null
    }
    const activeFileId = s.activeFileIdByWorktree?.[activeWorktreeId]
    if (!activeFileId) {
      return null
    }
    const activeFile = s.openFiles?.find(
      (file) => file.id === activeFileId && file.worktreeId === activeWorktreeId
    )
    if (!activeFile) {
      return null
    }
    return buildActiveOpenFileSignature(activeFile.diffSource, activeFile.relativePath)
  })
  const activeOpenRowKeys = (() =>
    buildActiveOpenRowKeys(activeOpenFileSignature, visibleFileRowKeys))()
  const handleOpenDiff = (entry: GitStatusEntry, event?: SourceControlRowOpenEvent) => {
    if (!activeWorktreeId || !worktreePath) {
      return
    }
    const targetGroupId = resolveSplitTargetGroupId(event)
    const embeddedTargetTabId = targetGroupId ? undefined : workspacePanelTabId
    const openAsPreview = shouldOpenSourceControlRowAsPreview(event, targetGroupId)
    if (entry.conflictKind && entry.conflictStatus) {
      if (entry.conflictStatus === 'unresolved') {
        trackConflictPath(activeWorktreeId, entry.path, entry.conflictKind)
      }
      openConflictFile(activeWorktreeId, worktreePath, entry, detectLanguage(entry.path), {
        targetGroupId,
        workspacePanelTabId: embeddedTargetTabId,
        preview: openAsPreview
      })
      return
    }
    const language = detectLanguage(entry.path)
    const filePath = joinPath(worktreePath, entry.path)
    openDiff(activeWorktreeId, filePath, entry.path, language, entry.area === 'staged', {
      targetGroupId,
      workspacePanelTabId: embeddedTargetTabId,
      preview: openAsPreview
    })
  }
  const handleToggleSourceControlViewMode = () => {
    if (!settings) {
      return
    }
    updateSettings({
      sourceControlViewMode: getNextSourceControlViewMode(sourceControlViewMode)
    })
  }
  return {
    ...scope,
    handleActionInvoke,
    resolveSplitTargetGroupId,
    activeOpenFileSignature,
    activeOpenRowKeys,
    handleOpenDiff,
    handleToggleSourceControlViewMode
  }
}

export type SourceControlFileOpenController = ReturnType<typeof useSourceControlFileOpen>
