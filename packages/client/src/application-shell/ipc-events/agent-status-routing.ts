import type { ParsedAgentStatusPayload } from '@yiru/protocol/agent/status-records'
import { parsePaneKey } from '@yiru/protocol/terminal/pane-identity'
import { titleHasAgentName } from '~renderer/agent/title/tokens'
import { getRepoMapFromState, getWorktreeMapFromState } from '~renderer/store/selectors'
import type { AppState } from '~renderer/store/types'
import { resolveAgentPaneAuthorityKey } from '~renderer/terminal-pane/agent/pane-authority'
import { collectLeafIdsInOrder } from '~renderer/terminal-pane/layout-serialization'

export function isAgentStatusForRecentlyClosedTab(
  store: Pick<AppState, 'recentlyClosedAgentStatusTabIds' | 'recentlyRetiredAgentStatusPaneKeys'>,
  paneKey: string
): boolean {
  const ownerPaneKey = resolveAgentPaneAuthorityKey(paneKey)
  if (store.recentlyRetiredAgentStatusPaneKeys?.[ownerPaneKey] === true) {
    return true
  }
  const tabId = parsePaneKey(ownerPaneKey)?.tabId
  return tabId ? store.recentlyClosedAgentStatusTabIds[tabId] === true : false
}

export function applyResolvedAgentTerminalTitleToTab(
  store: AppState,
  paneKey: string,
  previousTitle: string | undefined,
  nextTitle: string | undefined
): void {
  if (!nextTitle || nextTitle === previousTitle) {
    return
  }
  const parsed = parsePaneKey(paneKey)
  if (!parsed) {
    return
  }
  const layout = store.terminalLayoutsByTabId?.[parsed.tabId]
  if (layout?.root && layout.activeLeafId && layout.activeLeafId !== parsed.leafId) {
    return
  }
  store.updateTabTitle(parsed.tabId, nextTitle)
}

export type PaneStatusRoute = {
  exists: boolean
  title: string | undefined
  identityTitle: string | undefined
  repoConnectionId: string | null
  repoConnectionResolved: boolean
  owningWorktreeId: string | undefined
}

function missingPaneRoute(args?: {
  owningWorktreeId?: string
  repoConnectionResolved?: boolean
}): PaneStatusRoute {
  return {
    exists: false,
    title: undefined,
    identityTitle: undefined,
    repoConnectionId: null,
    repoConnectionResolved: args?.repoConnectionResolved ?? false,
    owningWorktreeId: args?.owningWorktreeId
  }
}

export function resolvePaneStatusRoute(store: AppState, paneKey: string): PaneStatusRoute {
  const parsed = parsePaneKey(paneKey)
  if (!parsed) {
    return missingPaneRoute()
  }
  const layout = store.terminalLayoutsByTabId?.[parsed.tabId]
  let tabTitle: string | undefined
  let unifiedTabLabel: string | undefined
  let owningWorktreeId: string | undefined
  for (const [worktreeId, tabs] of Object.entries(store.tabsByWorktree)) {
    const tab = tabs.find((entry) => entry.id === parsed.tabId)
    if (!tab) {
      continue
    }
    tabTitle = tab.title
    owningWorktreeId = worktreeId
    const visibleTab = (store.unifiedTabsByWorktree?.[worktreeId] ?? []).find(
      (entry) => entry.contentType === 'terminal' && entry.entityId === parsed.tabId
    )
    unifiedTabLabel = visibleTab?.label?.trim() || undefined
    break
  }
  const worktree = owningWorktreeId
    ? getWorktreeMapFromState(store).get(owningWorktreeId)
    : undefined
  const repoConnectionResolved = worktree ? getRepoMapFromState(store).has(worktree.repoId) : false
  if (!owningWorktreeId) {
    return missingPaneRoute({ repoConnectionResolved })
  }
  const leafExists = layout?.root
    ? collectLeafIdsInOrder(layout.root).includes(parsed.leafId)
    : true
  if (!leafExists) {
    return missingPaneRoute({ owningWorktreeId, repoConnectionResolved })
  }
  const paneTitle = layout?.titlesByLeafId?.[parsed.leafId] || undefined
  return {
    exists: true,
    title: paneTitle ?? tabTitle,
    identityTitle: paneTitle ?? unifiedTabLabel ?? tabTitle,
    repoConnectionId: null,
    repoConnectionResolved,
    owningWorktreeId
  }
}

export function resolveWorktreeStatusRoute(
  store: AppState,
  worktreeId: string
): {
  worktreeExists: boolean
  repoConnectionId: string | null
  repoConnectionResolved: boolean
} {
  const worktree = getWorktreeMapFromState(store).get(worktreeId)
  if (!worktree) {
    return { worktreeExists: false, repoConnectionId: null, repoConnectionResolved: false }
  }
  return {
    worktreeExists: true,
    repoConnectionId: null,
    repoConnectionResolved: getRepoMapFromState(store).has(worktree.repoId)
  }
}

export function resolveHookPayloadAgentType(
  payload: ParsedAgentStatusPayload,
  terminalTitle: string | undefined
): ParsedAgentStatusPayload {
  if (
    payload.agentType !== 'claude' ||
    !terminalTitle ||
    !titleHasAgentName(terminalTitle, 'openclaude')
  ) {
    return payload
  }
  return { ...payload, agentType: 'openclaude' }
}
