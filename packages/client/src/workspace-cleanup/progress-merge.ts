import type { WorkspaceCleanupCandidate, WorkspaceCleanupScanProgress } from '@yiru/protocol'

let progressCandidateIndex: {
  scanToken: number
  scanId: string
  candidates: WorkspaceCleanupCandidate[]
  indexesByWorktreeId: Map<string, number>
} | null = null

export function resetWorkspaceCleanupProgressCandidateIndex(): void {
  progressCandidateIndex = null
}

export function mergeWorkspaceCleanupProgressCandidates({
  previousCandidates,
  nextCandidates,
  progress,
  scanToken
}: {
  previousCandidates: readonly WorkspaceCleanupCandidate[]
  nextCandidates: readonly WorkspaceCleanupCandidate[]
  progress: WorkspaceCleanupScanProgress
  scanToken: number
}): WorkspaceCleanupCandidate[] {
  if (progress.candidateMode !== 'append') {
    progressCandidateIndex = null
    return [...nextCandidates]
  }

  if (nextCandidates.length === 0) {
    return previousCandidates as WorkspaceCleanupCandidate[]
  }

  const indexCache = getWorkspaceCleanupProgressCandidateIndex(
    previousCandidates,
    progress.scanId,
    scanToken
  )
  const merged = [...indexCache.candidates]
  for (const candidate of nextCandidates) {
    const existingIndex = indexCache.indexesByWorktreeId.get(candidate.worktreeId)
    if (existingIndex === undefined) {
      indexCache.indexesByWorktreeId.set(candidate.worktreeId, merged.length)
      merged.push(candidate)
      continue
    }
    merged[existingIndex] = candidate
  }
  progressCandidateIndex = {
    scanToken,
    scanId: progress.scanId,
    candidates: merged,
    indexesByWorktreeId: indexCache.indexesByWorktreeId
  }
  return merged
}

function getWorkspaceCleanupProgressCandidateIndex(
  candidates: readonly WorkspaceCleanupCandidate[],
  scanId: string,
  scanToken: number
): {
  candidates: WorkspaceCleanupCandidate[]
  indexesByWorktreeId: Map<string, number>
} {
  if (
    progressCandidateIndex?.scanToken === scanToken &&
    progressCandidateIndex.scanId === scanId &&
    progressCandidateIndex.candidates === candidates
  ) {
    return progressCandidateIndex
  }

  return {
    candidates: [...candidates],
    indexesByWorktreeId: new Map(
      candidates.map((candidate, index) => [candidate.worktreeId, index])
    )
  }
}
