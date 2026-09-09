import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import React, { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { selectWorktreeDiffCommentsOrEmpty } from '~renderer/diff-comments/worktree-selector'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import { YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, type EditorPathMutationTarget } from '../autosave'
import type { DiffCodeViewFile, DiffCodeViewHandle } from '../diff-code-view/view'
import { DiffNotesSendMenu } from '../diff-notes-send-menu'
import { DIFF_SECTION_HEADER_HEIGHT_PX, DiffSectionHeader } from '../diff-section/header'
import type { DiffSection } from '../diff-section/types'
import { resolveEditorFontFamily } from '../font-family'
import { computeDiffEditorFontSize } from '../font-zoom'
import type { OpenFile } from '../state'
import { CombinedDiffNotesControl } from './notes-control'
import {
  COMBINED_DIFF_REVEAL_SECTION_EVENT,
  createCombinedDiffSectionIndexMap,
  getCombinedDiffEntrySectionKey,
  handleCombinedDiffSectionNavigation,
  type CombinedDiffEntry,
  type CombinedDiffRevealSectionRequest
} from './section-model'
import { openCombinedDiffSection } from './section-open'
import { applyCombinedDiffSectionContent, writeCombinedDiffSection } from './section-save'
import { CombinedDiffSurface } from './surface'
import { useCombinedDiffCodeViewFiles } from './use-code-view-files'
import { useCombinedDiffSections } from './use-sections'
import { buildCombinedGitStatusSignature, saveCombinedDiffViewState } from './view-state'

const EMPTY_GIT_STATUS_ENTRIES: GitStatusEntry[] = []
const EMPTY_GIT_BRANCH_ENTRIES: GitBranchChangeEntry[] = []

export default function CombinedDiffViewer({
  file,
  viewStateKey
}: {
  file: OpenFile
  viewStateKey: string
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const gitStatusEntries = useAppStore(
    (s) => s.gitStatusByWorktree[file.worktreeId] ?? EMPTY_GIT_STATUS_ENTRIES
  )
  const liveBranchEntries = useAppStore(
    (s) => s.gitBranchChangesByWorktree[file.worktreeId] ?? EMPTY_GIT_BRANCH_ENTRIES
  )
  const branchSummary = useAppStore((s) => s.gitBranchCompareSummaryByWorktree[file.worktreeId])
  const openAllDiffs = useAppStore((s) => s.openAllDiffs)
  const openConflictReview = useAppStore((s) => s.openConflictReview)
  const openBranchAllDiffs = useAppStore((s) => s.openBranchAllDiffs)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const diffCommentsForWorktree = useAppStore((s) =>
    selectWorktreeDiffCommentsOrEmpty(s, file.worktreeId)
  )
  const activeGroupId = useAppStore((s) => s.activeGroupIdByWorktree[file.worktreeId])
  const isDark =
    settings?.theme === 'dark' ||
    (settings?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const codeViewRef = useRef<DiffCodeViewHandle | null>(null)
  const {
    loadedIndicesRef,
    model,
    retrySection,
    sections,
    sectionsRef,
    setAllSectionsCollapsed,
    setSections,
    sideBySide,
    toggleSection,
    toggleSideBySide
  } = useCombinedDiffSections({
    defaultView: settings?.diffDefaultView,
    file,
    gitStatusEntries,
    liveBranchEntries,
    viewStateKey
  })
  const {
    branchCompare,
    combinedMode,
    commitCompare,
    entries,
    entrySignature,
    isAllMode,
    isBranchMode,
    isCommitMode,
    shouldAutoReloadFromGitStatus
  } = model

  // Why: this is handed to CodeView, which diffs its options on every render,
  // so an inline arrow here would churn the whole surface.
  const renderSectionHeaderTrailingContent = (section: DiffSection): ReactNode => {
    const hasFileNotes = diffCommentsForWorktree.some(
      (comment) => comment.filePath === section.path
    )
    return hasFileNotes ? (
      <DiffNotesSendMenu
        worktreeId={file.worktreeId}
        groupId={activeGroupId ?? file.worktreeId}
        comments={diffCommentsForWorktree}
        filePath={section.path}
        showFileScope
        triggerClassName="p-0.5 can-hover:opacity-0 group-hover:opacity-100"
      />
    ) : null
  }

  const sectionIndexByKey = (() => createCombinedDiffSectionIndexMap(sections))()
  const sectionIndexByKeyRef = useRef(sectionIndexByKey)
  useLayoutEffect(() => {
    sectionIndexByKeyRef.current = sectionIndexByKey
  }, [sectionIndexByKey])
  const requestCombinedDiffSectionReload = useEventCallback((index: number): void => {
    const section = sectionsRef.current[index]
    if (!section || section.dirty) {
      return
    }
    retrySection(index)
  })
  const revealSection = useEventCallback((entry: CombinedDiffEntry) => {
    const navigatedIndex = handleCombinedDiffSectionNavigation({
      mode: combinedMode,
      entry,
      sections: sectionsRef.current,
      sectionIndexByKey,
      toggleSection,
      scrollToIndex: (index) => {
        const key = sectionsRef.current[index]?.key
        if (key) {
          codeViewRef.current?.scrollToFile(key)
        }
      }
    })
    if (navigatedIndex !== null) {
      // Why: revealing a section is the user's explicit "show me this diff"
      // affordance. Re-selecting an already-loaded row must refetch in case
      // the file or git index changed while the section stayed mounted.
      requestCombinedDiffSectionReload(navigatedIndex)
    }
  })

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<CombinedDiffRevealSectionRequest>).detail
      if (!detail || detail.worktreeId !== file.worktreeId) {
        return
      }
      revealSection(detail.entry)
    }
    window.addEventListener(COMBINED_DIFF_REVEAL_SECTION_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(COMBINED_DIFF_REVEAL_SECTION_EVENT, handler as EventListener)
  }, [file.worktreeId, revealSection])

  const combinedGitStatusSignature = (() => {
    if (!shouldAutoReloadFromGitStatus) {
      return ''
    }
    return buildCombinedGitStatusSignature(sections, gitStatusEntries)
  })()
  const prevCombinedGitStatusSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    if (!shouldAutoReloadFromGitStatus) {
      prevCombinedGitStatusSignatureRef.current = null
      return
    }
    if (prevCombinedGitStatusSignatureRef.current === null) {
      prevCombinedGitStatusSignatureRef.current = combinedGitStatusSignature
      return
    }
    if (prevCombinedGitStatusSignatureRef.current === combinedGitStatusSignature) {
      return
    }
    prevCombinedGitStatusSignatureRef.current = combinedGitStatusSignature
    for (const index of loadedIndicesRef.current) {
      requestCombinedDiffSectionReload(index)
    }
  }, [
    combinedGitStatusSignature,
    loadedIndicesRef,
    requestCombinedDiffSectionReload,
    shouldAutoReloadFromGitStatus
  ])

  useEffect(() => {
    if (combinedMode !== 'all' && combinedMode !== 'uncommitted') {
      return
    }
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<EditorPathMutationTarget>).detail
      if (!detail || detail.worktreeId !== file.worktreeId) {
        return
      }
      const hasRuntimeOwnerFilter = Object.prototype.hasOwnProperty.call(
        detail,
        'runtimeEnvironmentId'
      )
      const targetRuntimeOwner = detail.runtimeEnvironmentId?.trim() || null
      const fileRuntimeOwner = file.runtimeEnvironmentId?.trim() || null
      if (hasRuntimeOwnerFilter && targetRuntimeOwner !== fileRuntimeOwner) {
        return
      }
      for (const area of ['unstaged', 'staged', 'untracked'] as const) {
        const key = getCombinedDiffEntrySectionKey('uncommitted', {
          path: detail.relativePath,
          status: 'modified',
          area
        })
        const index = sectionIndexByKeyRef.current.get(key)
        if (index !== undefined) {
          requestCombinedDiffSectionReload(index)
        }
      }
    }
    window.addEventListener(YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, handler as EventListener)
  }, [file.runtimeEnvironmentId, file.worktreeId, requestCombinedDiffSectionReload, combinedMode])

  const toggleDiffWordWrap = () => {
    void updateSettings({ diffWordWrap: settings?.diffWordWrap !== true })
  }

  const openSection = (index: number): void => {
    const section = sectionsRef.current[index]
    if (!section) {
      return
    }
    openCombinedDiffSection({
      branchCompare,
      commitCompare,
      file,
      isAllMode,
      isBranchMode,
      isCommitMode,
      section
    })
  }

  const handleSectionSave = async (index: number, content: string) => {
    const section = sections[index]
    if (!section || content === section.modifiedContent) {
      return
    }
    try {
      await writeCombinedDiffSection(file, section, content)
      setSections((current) =>
        current.map((currentSection, sectionIndex) =>
          sectionIndex === index
            ? applyCombinedDiffSectionContent(currentSection, content)
            : currentSection
        )
      )
    } catch (err) {
      console.error('Save failed:', err)
    }
  }

  const handleSectionSaveEvent = useEventCallback(handleSectionSave)

  useEffect(() => {
    if (sections.length === 0 && entries.length > 0) {
      return
    }
    saveCombinedDiffViewState(viewStateKey, {
      entrySignature,
      gitStatusSignature: combinedGitStatusSignature,
      sections,
      loadedIndices: Array.from(loadedIndicesRef.current).filter(
        (index) => !sections[index]?.loading
      ),
      sideBySide
    })
  }, [
    combinedGitStatusSignature,
    entries.length,
    entrySignature,
    loadedIndicesRef,
    sections,
    sideBySide,
    viewStateKey
  ])

  const codeViewFiles = useCombinedDiffCodeViewFiles({
    comments: diffCommentsForWorktree,
    isBranchMode,
    sections,
    sideBySide
  })
  const codeViewRender = (() => ({
    isDark,
    sideBySide,
    // Why: a section is one row in a shared scroller, so sideways scrolling
    // inside it would fight the list. Wrapping keeps one scroll axis.
    wordWrap: true,
    disableFileHeader: false
  }))()
  const codeViewFont = (() => ({
    fontSize: computeDiffEditorFontSize(settings?.terminalFontSize ?? 13, editorFontZoomLevel),
    fontFamily: resolveEditorFontFamily(settings)
  }))()
  const renderCombinedDiffHeader = (codeViewFile: DiffCodeViewFile) => {
    const index = sectionIndexByKeyRef.current.get(codeViewFile.source.key)
    const section = index === undefined ? undefined : sectionsRef.current[index]
    if (index === undefined || !section) {
      return null
    }
    return (
      <DiffSectionHeader
        path={section.path}
        dirty={section.dirty}
        collapsed={section.collapsed}
        added={section.added ?? 0}
        removed={section.removed ?? 0}
        onToggle={() => toggleSection(index)}
        onOpenSection={(event) => {
          event.stopPropagation()
          openSection(index)
        }}
        openSectionTitle={
          isAllMode || isBranchMode || isCommitMode ? 'Open diff' : 'Open in editor'
        }
        trailingContent={renderSectionHeaderTrailingContent(section)}
      />
    )
  }
  const handleFileEditComplete = (fileKey: string, contents: string) => {
    const index = sectionIndexByKeyRef.current.get(fileKey)
    if (index !== undefined) {
      void handleSectionSaveEvent(index, contents)
    }
  }
  const handleRetryFile = (fileKey: string) => {
    const index = sectionIndexByKeyRef.current.get(fileKey)
    if (index !== undefined) {
      retrySection(index)
    }
  }

  const openAlternateDiff = () => {
    if (!file.combinedAlternate) {
      return
    }

    if (file.combinedAlternate.source === 'combined-all') {
      openAllDiffs(file.worktreeId, file.filePath)
      return
    }

    if (branchSummary && branchSummary.status === 'ready') {
      openBranchAllDiffs(file.worktreeId, file.filePath, branchSummary, {
        source: 'combined-all'
      })
    }
  }

  const openSkippedConflicts = (): void => {
    const skippedConflicts = file.skippedConflicts ?? []
    openConflictReview(
      file.worktreeId,
      file.filePath,
      skippedConflicts.map((entry) => ({
        path: entry.path,
        conflictKind: entry.conflictKind
      })),
      'combined-diff-exclusion'
    )
  }
  const codeViewProps = {
    viewRef: codeViewRef,
    files: codeViewFiles,
    render: codeViewRender,
    font: codeViewFont,
    worktreeId: file.worktreeId,
    className: 'scrollbar-editor bg-background h-full min-h-0 overflow-x-hidden overflow-y-auto',
    scrollCacheKey: viewStateKey,
    renderFileHeader: renderCombinedDiffHeader,
    headerHeight: DIFF_SECTION_HEADER_HEIGHT_PX,
    onRetryFile: handleRetryFile,
    onFileEditComplete: handleFileEditComplete
  }

  return (
    <CombinedDiffSurface
      branchBaseRef={branchCompare?.baseRef}
      codeViewProps={codeViewProps}
      commitCompare={isCommitMode ? commitCompare : null}
      file={file}
      isAllMode={isAllMode}
      isBranchMode={isBranchMode}
      isCommitMode={isCommitMode}
      isWordWrapEnabled={settings?.diffWordWrap === true}
      notesControl={
        <CombinedDiffNotesControl
          worktreeId={file.worktreeId}
          groupId={activeGroupId ?? file.worktreeId}
          comments={diffCommentsForWorktree}
        />
      }
      onOpenAlternateDiff={openAlternateDiff}
      onOpenConflictReview={openSkippedConflicts}
      onSetAllSectionsCollapsed={setAllSectionsCollapsed}
      onToggleSideBySide={toggleSideBySide}
      onToggleWordWrap={toggleDiffWordWrap}
      sections={sections}
      sideBySide={sideBySide}
    />
  )
}
