import type { NestedRepoScanResult } from '@agentstart/protocol/project/group-model'

export function getSelectedNestedRepoPathsInScanOrder(
  scan: Pick<NestedRepoScanResult, 'repos'>,
  selectedPaths: ReadonlySet<string>
): string[] {
  return scan.repos.filter((repo) => selectedPaths.has(repo.path)).map((repo) => repo.path)
}
