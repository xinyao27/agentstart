import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import { translate } from '~renderer/i18n/i18n'

import { YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, type EditorPathMutationTarget } from '../autosave'
import type { DiffCodeViewNotice } from '../diff-code-view/notices'
import type { DiffSection } from '../diff-section/types'
import { setWithLRU } from '../scroll-cache'

export type CachedCombinedDiffViewState = {
  entrySignature: string
  gitStatusSignature: string
  sections: DiffSection[]
  loadedIndices: number[]
  sideBySide: boolean
}

const viewStateCache = new Map<string, CachedCombinedDiffViewState>()
let collapsedPreference: boolean | null = null
let sideBySidePreference: boolean | null = null

export const combinedDiffPreferences = {
  getCollapsed(): boolean | null {
    return collapsedPreference
  },
  setCollapsed(collapsed: boolean): void {
    collapsedPreference = collapsed
  },
  getSideBySide(defaultView?: string): boolean {
    return sideBySidePreference ?? defaultView === 'side-by-side'
  },
  hasSideBySide(): boolean {
    return sideBySidePreference !== null
  },
  setSideBySide(sideBySide: boolean): void {
    sideBySidePreference = sideBySide
  }
}

export function getCombinedDiffViewState(key: string): CachedCombinedDiffViewState | undefined {
  return viewStateCache.get(key)
}

export function saveCombinedDiffViewState(key: string, state: CachedCombinedDiffViewState): void {
  setWithLRU(viewStateCache, key, state)
}

export function deleteCombinedDiffViewState(key: string): void {
  viewStateCache.delete(key)
}

function invalidateCombinedDiffCachesForRelativePath(relativePath: string): void {
  for (const [key, cached] of viewStateCache.entries()) {
    if (cached.sections.some((section) => section.path === relativePath)) {
      viewStateCache.delete(key)
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener(YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, (event) => {
    const detail = (event as CustomEvent<EditorPathMutationTarget>).detail
    if (detail?.relativePath) {
      // Why: inactive combined-diff tabs are unmounted, so only a module-level
      // cache bust can prevent a remount from replaying stale section bodies.
      invalidateCombinedDiffCachesForRelativePath(detail.relativePath)
    }
  })
}

export function buildCombinedGitStatusSignature(
  sections: readonly { path: string }[],
  gitStatusEntries: readonly GitStatusEntry[]
): string {
  const sectionPaths = new Set(sections.map((section) => section.path))
  const matching = gitStatusEntries.filter((entry) => sectionPaths.has(entry.path))
  return JSON.stringify(
    matching.map((entry) => ({
      path: entry.path,
      area: entry.area,
      status: entry.status,
      added: entry.added ?? null,
      removed: entry.removed ?? null
    }))
  )
}

export function getRetainedResolvedSnapshotEntries(
  sections: readonly DiffSection[]
): GitStatusEntry[] {
  return sections.flatMap((section) =>
    section.area === undefined
      ? []
      : [
          {
            path: section.path,
            status: section.status as GitStatusEntry['status'],
            area: section.area,
            oldPath: section.oldPath,
            added: section.added,
            removed: section.removed
          }
        ]
  )
}

export function resolveCombinedDiffNotice(
  section: DiffSection,
  context: { isBranchMode: boolean; sideBySide: boolean }
): DiffCodeViewNotice | undefined {
  if (section.loading) {
    return { kind: 'loading' }
  }
  if (section.error) {
    return { kind: 'error', message: section.error }
  }
  if (section.largeDiffRenderLimit?.limited) {
    return { kind: 'large-diff', renderLimit: section.largeDiffRenderLimit }
  }
  const result = section.diffResult
  if (result?.kind !== 'binary') {
    return undefined
  }
  if (result.isImage) {
    return {
      kind: 'image',
      originalContent: result.originalContent,
      modifiedContent: result.modifiedContent,
      mimeType: result.mimeType ?? '',
      sideBySide: context.sideBySide
    }
  }
  return {
    kind: 'binary',
    reason: context.isBranchMode
      ? translate(
          'auto.components.editor.DiffSectionBody.7ce8436458',
          'Text diff is unavailable for this file in branch compare.'
        )
      : translate(
          'auto.components.editor.DiffSectionBody.72f71f52eb',
          'Text diff is unavailable for this file.'
        )
  }
}

export function areCombinedDiffNoticesEqual(a: DiffCodeViewNotice, b: DiffCodeViewNotice): boolean {
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'error' && b.kind === 'error') {
    return a.message === b.message
  }
  if (a.kind === 'binary' && b.kind === 'binary') {
    return a.reason === b.reason
  }
  if (a.kind === 'image' && b.kind === 'image') {
    return (
      a.originalContent === b.originalContent &&
      a.modifiedContent === b.modifiedContent &&
      a.mimeType === b.mimeType &&
      a.sideBySide === b.sideBySide
    )
  }
  if (a.kind === 'large-diff' && b.kind === 'large-diff') {
    return a.renderLimit === b.renderLimit && a.saveLabel === b.saveLabel
  }
  return a.kind === 'loading'
}

const SECTION_LOAD_TIMEOUT_MS = 30_000

class SectionLoadTimeoutError extends Error {}

export function withDiffSectionLoadTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: number | null = null
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new SectionLoadTimeoutError()),
      SECTION_LOAD_TIMEOUT_MS
    )
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  })
}

export function getDiffSectionLoadErrorMessage(error: unknown): string {
  if (error instanceof SectionLoadTimeoutError) {
    return 'Diff did not finish loading.'
  }
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'Unable to load diff.'
}
