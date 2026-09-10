export type GitHubPRFileViewedState = 'DISMISSED' | 'VIEWED' | 'UNVIEWED'
export type GitHubPRFile = {
  path: string
  oldPath?: string
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  additions: number
  deletions: number
  isBinary: boolean
  reviewCommentLineNumbers?: number[]
  viewerViewedState?: GitHubPRFileViewedState
}
