import type { GitHistoryItem } from '@yiru/protocol/git/history-types'

export type GitGraphFindState = {
  query: string
  matchIds: string[]
  currentIndex: number
}

export const EMPTY_GIT_GRAPH_FIND_STATE: GitGraphFindState = {
  query: '',
  matchIds: [],
  currentIndex: -1
}

// Why: Git Graph's find widget searches subject/body text, author, and hash
// simultaneously rather than offering separate scoped fields.
export function computeGitGraphFindMatches(
  items: readonly GitHistoryItem[],
  query: string
): string[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return []
  }
  return items
    .filter((item) => {
      if (item.id.toLowerCase().includes(normalized)) {
        return true
      }
      if (item.displayId?.toLowerCase().includes(normalized)) {
        return true
      }
      if (item.subject.toLowerCase().includes(normalized)) {
        return true
      }
      if (item.message.toLowerCase().includes(normalized)) {
        return true
      }
      if (item.author?.toLowerCase().includes(normalized)) {
        return true
      }
      return Boolean(item.authorEmail?.toLowerCase().includes(normalized))
    })
    .map((item) => item.id)
}

export function stepGitGraphFindIndex(
  matchCount: number,
  currentIndex: number,
  direction: 1 | -1
): number {
  if (matchCount === 0) {
    return -1
  }
  const next = (currentIndex + direction + matchCount) % matchCount
  return next
}
