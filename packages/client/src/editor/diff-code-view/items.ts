import {
  parseDiffFromFile,
  type CodeViewDiffItem,
  type CodeViewFileItem,
  type CodeViewItem,
  type FileContents
} from '@pierre/diffs'
import type { DiffLineAnnotation } from '@pierre/diffs/react'
import type { GitFileStatus } from '@yiru/protocol/git/status-types'
import { useState } from 'react'

import { resolvePierreDiffLanguage } from '../pierre-diff-language'
import { buildDiffCodeViewNoticeAnnotations, type DiffCodeViewAnnotation } from './annotations'
import type { DiffCodeViewNotice } from './notices'

/** One changed file, in the shape our git layer already produces. */
export type DiffCodeViewSource = {
  /** Stable identity for the row across reloads — becomes the CodeView item id. */
  key: string
  path: string
  /** Pre-rename path, when git reported one. */
  oldPath?: string
  status: GitFileStatus | string
  originalContent: string
  modifiedContent: string
  /** Editor-side language id, used only when the filename infers nothing. */
  language?: string
}

// Why: git reports the two sides of a change through the status, not through
// empty content — an added file and a file emptied to zero bytes both carry an
// empty original. Pierre distinguishes them by which side is null, so the
// status is what decides, never the string length.
const ADDED_STATUSES: ReadonlySet<string> = new Set(['added', 'untracked'])

function buildFileContents(
  name: string,
  contents: string,
  cacheKey: string,
  language: string | undefined,
  path: string
): FileContents {
  const resolvedLanguage = language ? resolvePierreDiffLanguage(path, language) : undefined
  return resolvedLanguage
    ? { name, contents, cacheKey, lang: resolvedLanguage }
    : { name, contents, cacheKey }
}

/**
 * Parses one changed file into the diff metadata a CodeView item carries.
 *
 * Pierre resolves the change type from which side is null and from the two
 * names, so pure renames and empty additions come back as `rename-pure`/`new`
 * with no hunks rather than as errors. Returns null only if parsing genuinely
 * fails, so a single unreadable file cannot take the whole list down.
 */
export function buildDiffCodeViewFileDiff(
  source: DiffCodeViewSource,
  generation: number
): CodeViewDiffItem['fileDiff'] | null {
  const isAdded = ADDED_STATUSES.has(source.status)
  const isDeleted = source.status === 'deleted'
  const previousPath = source.oldPath ?? source.path
  const oldFile = isAdded
    ? null
    : buildFileContents(
        previousPath,
        source.originalContent,
        `${source.key}:${generation}:old`,
        source.language,
        previousPath
      )
  const newFile = isDeleted
    ? null
    : buildFileContents(
        source.path,
        source.modifiedContent,
        `${source.key}:${generation}:new`,
        source.language,
        source.path
      )
  try {
    return parseDiffFromFile(oldFile, newFile)
  } catch (error) {
    console.warn('[DiffCodeView] failed to parse diff', source.path, error)
    return null
  }
}

export type DiffCodeViewFileInput = {
  source: DiffCodeViewSource
  collapsed: boolean
  annotations: DiffLineAnnotation<DiffCodeViewAnnotation>[]
  /** Set for rows that carry something other than a text diff. */
  notice?: DiffCodeViewNotice
  /** Puts this row into Pierre's edit mode. Ignored while collapsed. */
  editable?: boolean
}

// Why: a file-level annotation only renders when the row has at least one
// rendered line, so a notice row ships as a one-line file item rather than an
// empty diff, which would render nothing at all.
const NOTICE_ANCHOR_CONTENTS = '\n'

function buildNoticeItem(
  input: DiffCodeViewFileInput,
  notice: DiffCodeViewNotice,
  version: number,
  generation: number
): CodeViewFileItem<DiffCodeViewAnnotation> {
  return {
    id: input.source.key,
    type: 'file',
    file: {
      name: input.source.path,
      contents: NOTICE_ANCHOR_CONTENTS,
      cacheKey: `${input.source.key}:notice:${generation}`
    },
    annotations: buildDiffCodeViewNoticeAnnotations(notice),
    collapsed: input.collapsed,
    version
  }
}

type CachedDiffCodeViewItem = {
  source: DiffCodeViewSource
  collapsed: boolean
  annotations: DiffLineAnnotation<DiffCodeViewAnnotation>[]
  notice: DiffCodeViewNotice | undefined
  editable: boolean | undefined
  /** Advances whenever the content behind this row was reparsed. */
  generation: number
  item: CodeViewItem<DiffCodeViewAnnotation>
}

function isSameParsedSource(a: DiffCodeViewSource, b: DiffCodeViewSource): boolean {
  // Why: content arrives as the same string reference until a refetch replaces
  // it, so these comparisons short-circuit instead of walking the file.
  return (
    a.path === b.path &&
    a.oldPath === b.oldPath &&
    a.status === b.status &&
    a.language === b.language &&
    a.originalContent === b.originalContent &&
    a.modifiedContent === b.modifiedContent
  )
}

/**
 * Keeps one stable `CodeViewDiffItem` per file.
 *
 * Why: controlled CodeView compares the incoming list item-by-item with `===`,
 * so rebuilding item objects every render would replace the whole list instead
 * of taking its append-only fast path — and it would reparse every diff. It
 * also only adopts a changed payload when `version` moves, so the version has
 * to advance in lockstep with the fields below.
 */
export function useDiffCodeViewItems(
  files: readonly DiffCodeViewFileInput[]
): CodeViewItem<DiffCodeViewAnnotation>[] {
  const [resolveItems] = useState(createDiffCodeViewItemResolver)
  return resolveItems(files)
}

function createDiffCodeViewItemResolver(): (
  files: readonly DiffCodeViewFileInput[]
) => CodeViewItem<DiffCodeViewAnnotation>[] {
  let cache = new Map<string, CachedDiffCodeViewItem>()
  return (files) => {
    const next = new Map<string, CachedDiffCodeViewItem>()
    const items: CodeViewItem<DiffCodeViewAnnotation>[] = []
    for (const file of files) {
      const id = file.source.key
      const cached = cache.get(id)
      const reusable =
        cached !== undefined &&
        cached.collapsed === file.collapsed &&
        cached.annotations === file.annotations &&
        cached.notice === file.notice &&
        cached.editable === file.editable &&
        isSameParsedSource(cached.source, file.source)
      if (reusable) {
        next.set(id, cached)
        items.push(cached.item)
        continue
      }
      const version = (cached?.item.version ?? 0) + 1
      const contentUnchanged =
        cached !== undefined && isSameParsedSource(cached.source, file.source)
      // Why: Pierre compares diff targets by cache key alone and never looks at
      // the contents behind it, so a reparsed row has to arrive under a new key
      // or the old render is kept. Owning the counter here means no caller can
      // forget to advance it.
      const generation = contentUnchanged
        ? (cached?.generation ?? 0)
        : (cached?.generation ?? 0) + 1
      let item: CodeViewItem<DiffCodeViewAnnotation> | null = null
      if (file.notice) {
        item = buildNoticeItem(file, file.notice, version, generation)
      } else {
        const reusableDiff =
          cached?.item.type === 'diff' && contentUnchanged
            ? cached.item.fileDiff
            : buildDiffCodeViewFileDiff(file.source, generation)
        item = reusableDiff
          ? {
              id,
              type: 'diff',
              fileDiff: reusableDiff,
              annotations: file.annotations,
              collapsed: file.collapsed,
              edit: file.editable === true,
              version
            }
          : null
      }
      if (!item) {
        continue
      }
      const entry: CachedDiffCodeViewItem = {
        source: file.source,
        collapsed: file.collapsed,
        annotations: file.annotations,
        notice: file.notice,
        editable: file.editable,
        generation,
        item
      }
      next.set(id, entry)
      items.push(item)
    }
    cache = next
    return items
  }
}
