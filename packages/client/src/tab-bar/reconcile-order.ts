import { isPageTabId } from '~renderer/application-shell/state/workspace-page-views'

/**
 * Reconcile stored tab bar order with the current set of tab IDs.
 * Keeps items that still exist in their stored positions, appends new items
 * at the end in their natural order (not grouped by type).
 */
export function reconcileTabOrder(
  storedOrder: string[] | undefined,
  terminalIds: string[],
  editorIds: string[],
  browserIds: string[] = [],
  simulatorIds: string[] = [],
  gitGraphIds: string[] = []
): string[] {
  const validIds = new Set([
    ...terminalIds,
    ...editorIds,
    ...browserIds,
    ...simulatorIds,
    ...gitGraphIds
  ])
  // Why: storedOrder is persisted group tab order and is mutated by many
  // codepaths (drop/move/reorder/hydrate). A stale or racey write can leave
  // the same tab id twice in the list, which surfaces as React's "two
  // children with the same key" warning when TabBar maps items to
  // SortableTab/EditorFileTab/BrowserTab. Dedupe at the render boundary so
  // the UI never produces duplicate keys regardless of store-side bugs.
  const result: string[] = []
  const inResult = new Set<string>()
  for (const id of storedOrder ?? []) {
    // Why: callers enumerate only the id kinds they own — terminal/editor/
    // browser/simulator/git-graph — while the stored order can also hold page
    // tabs. Those are real unified tabs now, but no caller's list derives them,
    // so dropping an id this pass simply cannot see would silently lose the
    // page tab's queued position.
    if ((validIds.has(id) || isPageTabId(id)) && !inResult.has(id)) {
      result.push(id)
      inResult.add(id)
    }
  }
  for (const id of [...terminalIds, ...editorIds, ...browserIds, ...simulatorIds, ...gitGraphIds]) {
    if (!inResult.has(id)) {
      result.push(id)
      inResult.add(id)
    }
  }
  return result
}
