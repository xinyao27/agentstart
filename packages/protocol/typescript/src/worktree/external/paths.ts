import { normalizeRuntimePathForComparison } from '../../host/path.js'

export function normalizeExternalWorktreeInboxPath(path: string): string {
  return normalizeRuntimePathForComparison(path)
}

export function areExternalWorktreeInboxPathsEqual(leftPath: string, rightPath: string): boolean {
  return (
    normalizeExternalWorktreeInboxPath(leftPath) === normalizeExternalWorktreeInboxPath(rightPath)
  )
}

export function mergeExternalWorktreeInboxPaths(
  existing: readonly string[] | undefined,
  additions: readonly string[]
): string[] {
  const seen = new Set((existing ?? []).map((path) => normalizeExternalWorktreeInboxPath(path)))
  const merged = [...(existing ?? [])]
  for (const path of additions) {
    const normalized = normalizeExternalWorktreeInboxPath(path)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    merged.push(path)
  }
  return merged
}

export function isExplicitlyImportedExternalWorktreePath(
  worktreePath: string,
  repo: { importedExternalWorktreePaths?: readonly string[] }
): boolean {
  return (repo.importedExternalWorktreePaths ?? []).some((path) =>
    areExternalWorktreeInboxPathsEqual(path, worktreePath)
  )
}
