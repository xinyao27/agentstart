import type { GitStatusEntry } from '@yiru/protocol/git/status-types'

import {
  getDiscardAllPaths,
  getUnstageAllPaths,
  isStageableStatusEntry
} from '../discard-all-sequence'
import type { SourceControlSectionArea } from './section-order'
import { collectSourceControlTreeFileEntries, type SourceControlTreeNode } from './tree'

export type GitStatusSourceControlTreeNode = SourceControlTreeNode<
  GitStatusEntry,
  SourceControlSectionArea
>

export type SourceControlTreeDirectoryNode = Extract<
  GitStatusSourceControlTreeNode,
  { type: 'directory' }
>

export type SourceControlDirectoryActionPaths = {
  stagePaths: string[]
  unstagePaths: string[]
  discardPaths: string[]
}

export function getSourceControlDirectoryActionPaths(
  node: SourceControlTreeDirectoryNode
): SourceControlDirectoryActionPaths {
  const entries = collectSourceControlTreeFileEntries(node)
  return {
    stagePaths: entries.filter(isStageableStatusEntry).map((entry) => entry.path),
    unstagePaths: getUnstageAllPaths(entries),
    discardPaths:
      node.area === 'unstaged' || node.area === 'untracked'
        ? getDiscardAllPaths(entries, node.area)
        : []
  }
}
