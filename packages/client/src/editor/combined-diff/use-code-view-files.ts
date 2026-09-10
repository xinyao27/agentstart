import type { DiffComment } from '@agentstart/protocol/git/diff-review'
import { useMemo } from 'react'

import type { DiffCodeViewFile } from '../diff-code-view/view'
import type { DiffSection } from '../diff-section/types'
import { resolveCombinedDiffNotice } from './view-state'

type UseCombinedDiffCodeViewFilesOptions = {
  comments: DiffComment[]
  isBranchMode: boolean
  sections: DiffSection[]
  sideBySide: boolean
}

export function useCombinedDiffCodeViewFiles({
  comments,
  isBranchMode,
  sections,
  sideBySide
}: UseCombinedDiffCodeViewFilesOptions): DiffCodeViewFile[] {
  const notices = useMemo(
    () =>
      sections.map((section) => resolveCombinedDiffNotice(section, { isBranchMode, sideBySide })),
    [isBranchMode, sections, sideBySide]
  )
  const commentsByPath = new Map<string, DiffComment[]>()
  for (const comment of comments) {
    const fileComments = commentsByPath.get(comment.filePath)
    if (fileComments) {
      fileComments.push(comment)
    } else {
      commentsByPath.set(comment.filePath, [comment])
    }
  }

  return sections.map((section, index) => ({
    source: {
      key: section.key,
      path: section.path,
      oldPath: section.oldPath,
      status: section.status,
      originalContent: section.originalContent,
      modifiedContent: section.modifiedContent
    },
    collapsed: section.collapsed,
    // Why: staged and committed sides have no working-tree file this view may edit.
    editable: section.area === 'unstaged',
    comments: commentsByPath.get(section.path),
    notice: notices[index]
  }))
}
