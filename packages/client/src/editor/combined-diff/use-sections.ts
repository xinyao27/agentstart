import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import type { DiffSection } from '../diff-section/types'
import type { OpenFile } from '../state'
import { getInitialCombinedDiffSectionLoadIndices } from './initial-section-load'
import { createCombinedDiffLoadScheduler } from './load-scheduler'
import { resolveCombinedDiffModel, type CombinedDiffModel } from './model'
import { loadCombinedDiffSection } from './section-load'
import { resolveInitialCombinedDiffSectionState } from './section-state'
import { combinedDiffPreferences, deleteCombinedDiffViewState } from './view-state'
import { getRetainedResolvedSnapshotEntries } from './view-state'

export type CombinedDiffSections = {
  loadedIndicesRef: MutableRefObject<Set<number>>
  model: CombinedDiffModel
  retrySection: (index: number) => void
  sections: DiffSection[]
  sectionsRef: MutableRefObject<DiffSection[]>
  setAllSectionsCollapsed: (collapsed: boolean) => void
  setSections: Dispatch<SetStateAction<DiffSection[]>>
  sideBySide: boolean
  toggleSection: (index: number) => void
  toggleSideBySide: () => void
}

type UseCombinedDiffSectionsOptions = {
  defaultView?: string
  file: OpenFile
  gitStatusEntries: GitStatusEntry[]
  liveBranchEntries: GitBranchChangeEntry[]
  viewStateKey: string
}

function createCombinedDiffLoadController(): {
  scheduler: ReturnType<typeof createCombinedDiffLoadScheduler>
  setLoadSection: (loadSection: (index: number) => Promise<void>) => void
} {
  let loadSection = async (_index: number): Promise<void> => {}
  return {
    scheduler: createCombinedDiffLoadScheduler({ loadSection: (index) => loadSection(index) }),
    setLoadSection: (nextLoadSection) => {
      loadSection = nextLoadSection
    }
  }
}

export function useCombinedDiffSections({
  defaultView,
  file,
  gitStatusEntries,
  liveBranchEntries,
  viewStateKey
}: UseCombinedDiffSectionsOptions): CombinedDiffSections {
  const [sectionState, setSectionState] = useState<{ key: string; sections: DiffSection[] }>({
    key: '',
    sections: []
  })
  const [defaultSideBySide] = useState(() => combinedDiffPreferences.getSideBySide(defaultView))
  const [sideOverride, setSideOverride] = useState<{ key: string; value: boolean } | null>(null)
  const loadedIndicesRef = useRef<Set<number>>(new Set())
  const loadingIndicesRef = useRef<Set<number>>(new Set())
  const sectionsRef = useRef<DiffSection[]>([])
  const generationRef = useRef(0)
  const [loadController] = useState(createCombinedDiffLoadController)

  const model = resolveCombinedDiffModel({
    file,
    gitStatusEntries,
    liveBranchEntries,
    retainedResolvedEntries: getRetainedResolvedSnapshotEntries(sectionState.sections)
  })
  const sectionStateKey = `${viewStateKey}\0${model.entrySignature}`
  const initial =
    sectionState.key === sectionStateKey
      ? null
      : resolveInitialCombinedDiffSectionState({
          combinedMode: model.combinedMode,
          entries: model.entries,
          entrySignature: model.entrySignature,
          gitStatusEntries,
          hasUncommittedEntriesSnapshot: model.hasUncommittedEntriesSnapshot,
          shouldAutoReloadFromGitStatus: model.shouldAutoReloadFromGitStatus,
          viewStateKey
        })
  const sections = initial?.sections ?? sectionState.sections
  const defaultViewSideBySide =
    defaultView !== undefined && !combinedDiffPreferences.hasSideBySide()
      ? defaultView === 'side-by-side'
      : defaultSideBySide
  const sideBySide =
    sideOverride?.key === sectionStateKey
      ? sideOverride.value
      : (initial?.sideBySide ?? defaultViewSideBySide)
  const setSections = useEventCallback((update: SetStateAction<DiffSection[]>): void => {
    setSectionState((current) => {
      const currentSections = current.key === sectionStateKey ? current.sections : sections
      return {
        key: sectionStateKey,
        sections: typeof update === 'function' ? update(currentSections) : update
      }
    })
  })

  useLayoutEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  useLayoutEffect(() => {
    loadedIndicesRef.current = initial?.loadedIndices ?? new Set()
    loadingIndicesRef.current.clear()
    loadController.scheduler.reset()
    generationRef.current += 1
  }, [initial, loadController, sectionStateKey])

  const loadSectionNow = useEventCallback(async (index: number): Promise<void> => {
    if (loadedIndicesRef.current.has(index) || loadingIndicesRef.current.has(index)) {
      return
    }
    loadingIndicesRef.current.add(index)
    const generation = generationRef.current
    const entry = model.entries[index]
    if (!entry) {
      loadingIndicesRef.current.delete(index)
      return
    }
    const loadedSection = await loadCombinedDiffSection({
      branchCompare: model.branchCompare,
      commitCompare: model.commitCompare,
      entry,
      file,
      isAllMode: model.isAllMode,
      isBranchMode: model.isBranchMode,
      isCommitMode: model.isCommitMode
    })
    loadingIndicesRef.current.delete(index)
    if (generationRef.current !== generation) {
      return
    }
    loadedIndicesRef.current.add(index)
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...loadedSection, loading: false } : section
      )
    )
  })
  useLayoutEffect(() => {
    loadController.setLoadSection(loadSectionNow)
  }, [loadController, loadSectionNow])

  useEffect(() => {
    const scheduler = loadController.scheduler
    scheduler.reset()
    return () => scheduler.dispose()
  }, [loadController])

  const requestSectionLoad = useEventCallback((index: number) => {
    if (!sectionsRef.current[index]?.collapsed) {
      loadController.scheduler.request(index)
    }
  })

  useEffect(() => {
    const current = sectionsRef.current
    for (let index = 0; index < current.length; index += 1) {
      if (current[index]?.loading && loadedIndicesRef.current.has(index)) {
        loadedIndicesRef.current.delete(index)
      }
    }
    const initialIndices = getInitialCombinedDiffSectionLoadIndices({
      sectionCount: current.length,
      loadedIndices: loadedIndicesRef.current
    })
    for (const index of initialIndices) {
      requestSectionLoad(index)
    }
  }, [model.entrySignature, requestSectionLoad, sections.length])

  const retrySection = (index: number): void => {
    const collapsed = sectionsRef.current[index]?.collapsed ?? false
    loadedIndicesRef.current.delete(index)
    loadingIndicesRef.current.delete(index)
    deleteCombinedDiffViewState(viewStateKey)
    generationRef.current += 1
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index
          ? {
              ...section,
              loading: !collapsed,
              error: undefined,
              diffResult: null,
              originalContent: '',
              modifiedContent: '',
              largeDiffRenderLimit: null,
              contentGeneration: (section.contentGeneration ?? 0) + 1
            }
          : section
      )
    )
    if (!collapsed) {
      loadController.scheduler.rerequest(index)
    }
  }

  const toggleSection = (index: number): void => {
    const shouldLoad = sectionsRef.current[index]?.collapsed ?? false
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, collapsed: !section.collapsed } : section
      )
    )
    if (shouldLoad) {
      loadController.scheduler.request(index)
    }
  }

  const setAllSectionsCollapsed = (collapsed: boolean): void => {
    combinedDiffPreferences.setCollapsed(collapsed)
    setSections((current) => current.map((section) => ({ ...section, collapsed })))
    if (!collapsed) {
      const initialIndices = getInitialCombinedDiffSectionLoadIndices({
        sectionCount: sectionsRef.current.length,
        loadedIndices: loadedIndicesRef.current
      })
      for (const index of initialIndices) {
        loadController.scheduler.request(index)
      }
    }
  }

  const toggleSideBySide = (): void => {
    const next = !sideBySide
    combinedDiffPreferences.setSideBySide(next)
    setSideOverride({ key: sectionStateKey, value: next })
  }

  return {
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
  }
}
