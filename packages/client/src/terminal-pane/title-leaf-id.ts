import { isTerminalLeafId } from '@agentstart/protocol/terminal/pane-identity'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode
} from '@agentstart/protocol/workspace/session'
import { FIRST_PANE_ID } from '~renderer/terminal-pane/pane-manager/first-pane-id'

export type RuntimePaneTitleLeafResolution = {
  title: string | null
  hasAnyPaneTitle: boolean
}

function getLeftmostLeafId(node: TerminalPaneLayoutNode): string {
  return node.type === 'leaf' ? node.leafId : getLeftmostLeafId(node.first)
}

function collectReplayCreatedPaneLeafIds(
  node: TerminalPaneLayoutNode,
  leafIdsInReplayCreationOrder: string[]
): void {
  if (node.type === 'leaf') {
    return
  }

  leafIdsInReplayCreationOrder.push(getLeftmostLeafId(node.second))

  if (node.first.type === 'split') {
    collectReplayCreatedPaneLeafIds(node.first, leafIdsInReplayCreationOrder)
  }
  if (node.second.type === 'split') {
    collectReplayCreatedPaneLeafIds(node.second, leafIdsInReplayCreationOrder)
  }
}

function collectLeafIdsInReplayCreationOrder(
  node: TerminalPaneLayoutNode | null | undefined
): string[] {
  if (!node) {
    return []
  }
  const leafIdsInReplayCreationOrder = [getLeftmostLeafId(node)]
  if (node.type === 'split') {
    collectReplayCreatedPaneLeafIds(node, leafIdsInReplayCreationOrder)
  }
  return leafIdsInReplayCreationOrder
}

export function resolveRuntimePaneTitleLeafId(
  tabLayout: { root?: TerminalLayoutSnapshot['root'] } | undefined,
  runtimePaneId: string
): string | null {
  return resolveRuntimePaneTitleLeafIdFromRoot(tabLayout?.root, runtimePaneId)
}

export function resolveRuntimePaneTitleLeafResolution(
  tabLayout: { root?: TerminalLayoutSnapshot['root'] } | undefined,
  paneTitles: Record<number, string> | undefined,
  leafId: string
): RuntimePaneTitleLeafResolution {
  if (!paneTitles) {
    return { title: null, hasAnyPaneTitle: false }
  }

  const titlesByPaneId = paneTitles as Record<string, string>
  let firstTitle: string | null = null
  let hasOnePaneTitle = false
  let hasMultiplePaneTitles = false

  for (const runtimePaneId in titlesByPaneId) {
    if (!Object.prototype.hasOwnProperty.call(titlesByPaneId, runtimePaneId)) {
      continue
    }

    const title = titlesByPaneId[runtimePaneId]
    if (hasOnePaneTitle) {
      hasMultiplePaneTitles = true
    } else {
      firstTitle = title
      hasOnePaneTitle = true
    }

    if (resolveRuntimePaneTitleLeafId(tabLayout, runtimePaneId) === leafId) {
      return { title, hasAnyPaneTitle: true }
    }
  }

  // Why: without a layout root, only a single reported pane title can be
  // attributed; any pane title still suppresses stale tab-title fallback.
  if (!tabLayout?.root && hasOnePaneTitle && !hasMultiplePaneTitles) {
    return { title: firstTitle, hasAnyPaneTitle: true }
  }

  return { title: null, hasAnyPaneTitle: hasOnePaneTitle }
}

function resolveRuntimePaneTitleLeafIdFromRoot(
  root: TerminalPaneLayoutNode | null | undefined,
  runtimePaneId: string
): string | null {
  if (isTerminalLeafId(runtimePaneId)) {
    return runtimePaneId
  }
  const numericPaneId = Number(runtimePaneId)
  if (!Number.isInteger(numericPaneId) || numericPaneId < FIRST_PANE_ID) {
    return null
  }
  const leafIds = collectLeafIdsInReplayCreationOrder(root)
  return leafIds[numericPaneId - FIRST_PANE_ID] ?? null
}
