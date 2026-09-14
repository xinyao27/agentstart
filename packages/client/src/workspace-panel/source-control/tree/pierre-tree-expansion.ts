import type { SourceControlPierreTreeData } from './pierre-tree-data'
import { getSubmoduleExpansionKey } from './submodule-expansion'

/**
 * Derives which Pierre rows are disclosed, given the panel's collapse state.
 *
 * Why: Pierre keeps disclosure state separate from its path set, and collapsing
 * a directory never changes which paths exist. Deriving expansion here — rather
 * than inside the tree build — keeps `SourceControlPierreTreeData.paths`
 * referentially stable across a collapse toggle, so the tree no longer resets
 * its whole store (reparse + resort + projection rebuild) for a disclosure
 * change.
 */
export function resolveSourceControlPierreExpandedPaths(
  data: SourceControlPierreTreeData,
  collapsedDirectoryKeys: ReadonlySet<string>,
  expandedSubmoduleKeys: ReadonlySet<string>
): string[] {
  const expandedPaths = new Set<string>()
  for (const [canonicalPath, target] of data.targetByCanonicalPath) {
    const isSubmodule = target.kind === 'uncommitted' && target.isSubmodule
    if (target.kind !== 'directory' && !isSubmodule) {
      continue
    }
    if (
      target.kind === 'directory'
        ? !collapsedDirectoryKeys.has(target.collapseKey)
        : expandedSubmoduleKeys.has(getSubmoduleExpansionKey(target.entry))
    ) {
      expandedPaths.add(canonicalPath)
    }
    // Why: ancestors that own no row of their own are synthesized by Pierre, so
    // leaving them closed would hide every descendant behind an unclickable row.
    let separatorIndex = 0
    while ((separatorIndex = canonicalPath.indexOf('/', separatorIndex)) >= 0) {
      const ancestorPath = canonicalPath.slice(0, separatorIndex + 1)
      separatorIndex += 1
      if (ancestorPath !== canonicalPath && !data.targetByCanonicalPath.has(ancestorPath)) {
        expandedPaths.add(ancestorPath)
      }
    }
  }
  return [...expandedPaths]
}
