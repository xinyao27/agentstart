import type { WorkspaceSpaceAnalysisValue as WorkspaceSpaceAnalysis } from '@yiru/protocol'

export function removeDeletedWorktreesFromAnalysis(
  analysis: WorkspaceSpaceAnalysis,
  deletedWorktreeIds: readonly string[]
): WorkspaceSpaceAnalysis {
  const deletedSet = new Set(deletedWorktreeIds)
  const worktrees = analysis.worktrees.filter((worktree) => !deletedSet.has(worktree.worktreeId))
  const rowsByRepoId = new Map<string, typeof worktrees>()
  for (const worktree of worktrees) {
    const repoRows = rowsByRepoId.get(worktree.repoId) ?? []
    repoRows.push(worktree)
    rowsByRepoId.set(worktree.repoId, repoRows)
  }
  const repos = analysis.repos.map((repo) => {
    const repoRows = rowsByRepoId.get(repo.repoId) ?? []
    return {
      ...repo,
      worktreeCount: repoRows.length,
      scannedWorktreeCount: repoRows.filter((row) => row.status === 'ok').length,
      unavailableWorktreeCount: repoRows.filter((row) => row.status !== 'ok').length,
      totalSizeBytes: repoRows.reduce((sum, row) => sum + row.sizeBytes, 0),
      reclaimableBytes: repoRows.reduce((sum, row) => sum + row.reclaimableBytes, 0)
    }
  })
  return {
    ...analysis,
    totalSizeBytes: worktrees.reduce((sum, row) => sum + row.sizeBytes, 0),
    reclaimableBytes: worktrees.reduce((sum, row) => sum + row.reclaimableBytes, 0),
    worktreeCount: worktrees.length,
    scannedWorktreeCount: worktrees.filter((row) => row.status === 'ok').length,
    unavailableWorktreeCount:
      worktrees.filter((row) => row.status !== 'ok').length +
      repos.filter((repo) => repo.error !== null).length,
    repos,
    worktrees
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isWorkspaceSpaceScanCancelled(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return message.includes('workspace space scan cancelled') || message.includes('was cancelled')
}
