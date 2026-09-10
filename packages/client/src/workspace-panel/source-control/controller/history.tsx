import type { GitBranchChangeEntry } from '@agentstart/protocol/git/branch-compare-types'
import type { DiffComment } from '@agentstart/protocol/git/diff-review'
import { useEffect } from 'react'
import { getDiffCommentSource } from '~renderer/editor/diff-comment-compat'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { joinPath } from '~renderer/path'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { stageRuntimeGitPath } from '~renderer/runtime/git-client'
import { useGitHistoryCommitActions } from '~renderer/workspace-panel/use-git-history-commit-actions'

import {
  cancelSourceControlEditorRevealFrames,
  requestSourceControlEditorRevealFrame
} from '../editor-reveal'
import { shouldOpenSourceControlRowAsPreview, type SourceControlRowOpenEvent } from '../split-open'
import type { SourceControlBranchCompareController } from './branch-compare'

export function useSourceControlHistory(scope: SourceControlBranchCompareController) {
  const {
    activeRepoSettings,
    activeWorktree,
    activeWorktreeId,
    branchEntries,
    branchSummary,
    entries,
    fetchUpstreamStatus,
    handleOpenDiff,
    isBranchVisible,
    isFolder,
    openBranchDiff,
    openFile,
    pendingCommentEditorRevealFrameIdsRef,
    refreshActiveGitStatusAfterMutation,
    resolveSplitTargetGroupId,
    setCollapsedSections,
    setCollapsedTreeDirs,
    setEditorViewMode,
    setMarkdownViewMode,
    setPendingEditorReveal,
    setScrollToDiffCommentId,
    workspacePanelTabId,
    worktreePath
  } = scope
  useEffect(() => {
    // Why: avoid Git subprocesses while the sidebar is hidden or Git has marked
    // the workspace as removable; remote operations refresh valid workspaces
    // before the sidebar becomes visible again.
    if (
      !activeWorktreeId ||
      !worktreePath ||
      activeWorktree?.prunable === true ||
      isFolder ||
      !isBranchVisible
    ) {
      return
    }
    const connectionId = getConnectionId(activeWorktreeId) ?? undefined
    void fetchUpstreamStatus(
      activeWorktreeId,
      worktreePath,
      connectionId,
      activeWorktree?.pushTarget,
      { runtimeTargetSettings: activeRepoSettings }
    )
  }, [
    activeRepoSettings,
    activeWorktree?.prunable,
    activeWorktree?.pushTarget,
    activeWorktreeId,
    fetchUpstreamStatus,
    isBranchVisible,
    isFolder,
    worktreePath
  ])
  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }
  const toggleTreeDir = (key: string) => {
    setCollapsedTreeDirs((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }
  const openCommittedDiff = (entry: GitBranchChangeEntry, event?: SourceControlRowOpenEvent) => {
    if (!activeWorktreeId || !worktreePath || !branchSummary || branchSummary.status !== 'ready') {
      return
    }
    const targetGroupId = resolveSplitTargetGroupId(event)
    const embeddedTargetTabId = targetGroupId ? undefined : workspacePanelTabId
    openBranchDiff(
      activeWorktreeId,
      worktreePath,
      entry,
      branchSummary,
      detectLanguage(entry.path),
      {
        targetGroupId,
        workspacePanelTabId: embeddedTargetTabId,
        preview: shouldOpenSourceControlRowAsPreview(event, targetGroupId)
      }
    )
  }
  const { loadCommitFiles, openHistoryCommitDiff, openCommitFile, handleCommitAction } =
    useGitHistoryCommitActions({
      activeWorktreeId,
      worktreePath,
      activeRepoSettings,
      workspacePanelTabId,
      resolveSplitTargetGroupId
    })
  // Why: opening a diff can mount its viewer this frame, so wait until its
  // scroll listener is attached before sending the note target.
  const stampCommentScrollAfterOpen = (commentId: string | undefined) => {
    if (!commentId) {
      return
    }
    requestSourceControlEditorRevealFrame(pendingCommentEditorRevealFrameIdsRef, () => {
      requestSourceControlEditorRevealFrame(pendingCommentEditorRevealFrameIdsRef, () => {
        setScrollToDiffCommentId(commentId)
      })
    })
  }
  const handleOpenComment = (comment: DiffComment) => {
    if (!activeWorktreeId || !worktreePath) {
      return
    }
    const filePath = comment.filePath
    const commentId = comment.id
    // Defensively clear any dangling prior scroll request before routing
    // this click; only the diff branches below will re-stamp it.
    cancelSourceControlEditorRevealFrames(pendingCommentEditorRevealFrameIdsRef)
    setScrollToDiffCommentId(null)
    if (getDiffCommentSource(comment) === 'markdown') {
      const absPath = joinPath(worktreePath, filePath)
      const language = detectLanguage(filePath)
      setEditorViewMode(absPath, 'edit')
      setMarkdownViewMode(absPath, 'source')
      openFile(
        {
          filePath: absPath,
          relativePath: filePath,
          worktreeId: activeWorktreeId,
          language,
          mode: 'edit'
        },
        { workspacePanelTabId }
      )
      setPendingEditorReveal(null)
      requestSourceControlEditorRevealFrame(pendingCommentEditorRevealFrameIdsRef, () => {
        requestSourceControlEditorRevealFrame(pendingCommentEditorRevealFrameIdsRef, () => {
          setPendingEditorReveal({
            filePath: absPath,
            line: comment.lineNumber,
            column: 1,
            matchLength: 0
          })
          setScrollToDiffCommentId(commentId)
        })
      })
      return
    }
    const matches = entries.filter((e) => e.path === filePath)
    const uncommitted =
      matches.find((e) => e.area === 'unstaged') ??
      matches.find((e) => e.area === 'untracked') ??
      matches[0]
    if (uncommitted) {
      handleOpenDiff(uncommitted)
      stampCommentScrollAfterOpen(commentId)
      return
    }
    const branchEntry = branchEntries.find((e) => e.path === filePath)
    if (branchEntry && branchSummary?.status === 'ready') {
      openCommittedDiff(branchEntry)
      stampCommentScrollAfterOpen(commentId)
      return
    }
    // Why: stale notes may outlive both diff sources; open the normal editor
    // in Changes mode so its diff viewer can still honor the note scroll target.
    const absPath = joinPath(worktreePath, filePath)
    const language = detectLanguage(filePath)
    openFile(
      {
        filePath: absPath,
        relativePath: filePath,
        worktreeId: activeWorktreeId,
        language,
        mode: 'edit'
      },
      { workspacePanelTabId }
    )
    if (commentId) {
      setEditorViewMode(absPath, 'changes')
      setScrollToDiffCommentId(commentId)
    }
  }
  const handleStage = async (filePath: string) => {
    if (!worktreePath) {
      return
    }
    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      await stageRuntimeGitPath(
        {
          // Why: route staging by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        filePath
      )
      await refreshActiveGitStatusAfterMutation()
    } catch {
      // git operation failed silently
    }
  }
  return {
    ...scope,
    toggleSection,
    toggleTreeDir,
    openCommittedDiff,
    loadCommitFiles,
    openHistoryCommitDiff,
    openCommitFile,
    handleCommitAction,
    handleOpenComment,
    handleStage
  }
}

export type SourceControlHistoryController = ReturnType<typeof useSourceControlHistory>
