import { isTerminalLeafId, makePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import type { TerminalLayoutSnapshot } from '@agentstart/protocol/workspace/session'
import { isClaudeManagementTitle } from '~renderer/agent/title/core'
import type { AppState } from '~renderer/store/types'
import {
  collectLeafIdsInOrder,
  normalizeTerminalLayoutSnapshot,
  serializePaneTree
} from '~renderer/terminal-pane/layout-serialization'
import { sanitizeTerminalLayoutPaneTitles } from '~renderer/terminal-pane/title-sanitization'
import { resolveEffectiveTerminalAppearance } from '~renderer/terminal/theme'

import type { RuntimeMobileTerminalTheme } from './remote-session/session-model'
import type { RuntimeMobileSessionSnapshotTab } from './remote-session/session-model'
import { resolveTerminalLayoutRoot } from './remote-terminal-layout-resolution'
import { getRegisteredRuntimeTerminalTab } from './runtime-terminal-registry'
import { resolveRuntimeTerminalTitle } from './runtime-terminal-title'

function mobileTerminalSurfaceId(parentTabId: string, leafId: string): string {
  return `${parentTabId}::${leafId}`
}

function hexToRgba(hex: string, alpha: number): string {
  let clean = hex.replace('#', '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function isHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
}

export function resolveMobileTerminalTheme(
  state: AppState,
  systemPrefersDark: boolean
): RuntimeMobileTerminalTheme | undefined {
  const settings = state.settings
  if (!settings) {
    return undefined
  }
  const appearance = resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
  const resolvedTheme = appearance.theme
    ? { ...appearance.theme, ...settings.terminalColorOverrides }
    : undefined
  if (!resolvedTheme) {
    return undefined
  }
  if (settings.terminalBackgroundOpacity !== undefined && isHexColor(resolvedTheme.background)) {
    resolvedTheme.background = hexToRgba(
      resolvedTheme.background,
      settings.terminalBackgroundOpacity
    )
  }
  if (settings.terminalCursorOpacity !== undefined && isHexColor(resolvedTheme.cursor)) {
    resolvedTheme.cursor = hexToRgba(resolvedTheme.cursor, settings.terminalCursorOpacity)
  }

  const theme: Record<string, string> = {}
  for (const [key, value] of Object.entries(resolvedTheme)) {
    if (typeof value === 'string') {
      theme[key] = value
    }
  }
  return { mode: appearance.mode, theme: theme as RuntimeMobileTerminalTheme['theme'] }
}

function getRuntimeLeafIdsForTerminal(tabId: string, state: AppState): string[] {
  const registered = getRegisteredRuntimeTerminalTab(tabId)
  const manager = registered?.getManager()
  const liveLeafIds = manager?.getPanes().map((pane) => pane.leafId) ?? []
  if (liveLeafIds.length > 0) {
    return liveLeafIds
  }

  const layout = state.terminalLayoutsByTabId[tabId]
  const persistedLeafIds = collectLeafIdsInOrder(layout?.root).filter(isTerminalLeafId)
  if (persistedLeafIds.length > 0) {
    return persistedLeafIds
  }

  // Why: a newly-created terminal tab can be in the store before TerminalPane
  // mounts. Without a live or persisted UUID leaf, there is no stable mobile
  // surface to publish yet; fabricating pane:1 would become stale after mount.
  return []
}

export function buildMobileTerminalSurfaceTabs(
  state: AppState,
  terminal: NonNullable<AppState['tabsByWorktree'][string]>[number],
  worktreeId: string,
  systemPrefersDark: boolean,
  unifiedTabId?: string
): RuntimeMobileSessionSnapshotTab[] {
  const registered = getRegisteredRuntimeTerminalTab(terminal.id)
  const isDesktopTabActive = unifiedTabId
    ? state.groupsByWorktree[worktreeId]?.some(
        (group) =>
          group.id === state.activeGroupIdByWorktree[worktreeId] &&
          group.activeTabId === unifiedTabId
      ) === true
    : state.activeTabId === terminal.id
  const manager = registered?.getManager()
  const liveActivePaneId = manager?.getActivePane()?.id ?? null
  const leafIds = getRuntimeLeafIdsForTerminal(terminal.id, state)
  const activeLeafId =
    liveActivePaneId !== null
      ? (manager?.getLeafId(liveActivePaneId) ?? null)
      : (state.terminalLayoutsByTabId[terminal.id]?.activeLeafId ?? leafIds[0] ?? null)
  const paneTitles = state.runtimePaneTitlesByTabId[terminal.id] ?? {}
  const generatedTitlesEnabled = state.settings?.tabAutoGenerateTitle === true
  const savedLayout = state.terminalLayoutsByTabId[terminal.id]
  const sanitizedSavedLayout = savedLayout
    ? sanitizeTerminalLayoutPaneTitles(savedLayout, terminal)
    : undefined
  const savedPtyIdsByLeafId = sanitizedSavedLayout?.ptyIdsByLeafId ?? {}
  const terminalTheme = resolveMobileTerminalTheme(state, systemPrefersDark)
  const container = registered?.getContainer()
  const firstChild = container?.firstElementChild
  const liveLayoutRoot = serializePaneTree(
    typeof HTMLElement !== 'undefined' && firstChild instanceof HTMLElement ? firstChild : null
  )
  const parentLayout = normalizeTerminalLayoutSnapshot({
    // Why: the live DOM tree (when mounted) is authoritative; otherwise the
    // saved tree. Both carry the real direction — only synthesize as a last
    // resort, never re-guess. Shared with the client-ingest path.
    root: resolveTerminalLayoutRoot({
      authoritativeRoot: liveLayoutRoot,
      existingRoot: sanitizedSavedLayout?.root,
      leafIds,
      onSynthesize: (leafCount) =>
        console.warn(
          `[sync-runtime-graph] synthesized parentLayout for ${leafCount} leaves with no live or saved tree`
        )
    }),
    activeLeafId,
    expandedLeafId: sanitizedSavedLayout?.expandedLeafId ?? null,
    ...(Object.keys(savedPtyIdsByLeafId).length > 0 ? { ptyIdsByLeafId: savedPtyIdsByLeafId } : {}),
    ...(sanitizedSavedLayout?.titlesByLeafId
      ? { titlesByLeafId: sanitizedSavedLayout.titlesByLeafId }
      : {})
  } satisfies TerminalLayoutSnapshot).snapshot
  return leafIds.map((leafId) => {
    const numericPaneId = manager?.getNumericIdForLeaf(leafId) ?? null
    const ptyId =
      numericPaneId === null
        ? (savedPtyIdsByLeafId[leafId] ?? (leafIds.length === 1 ? terminal.ptyId : null))
        : (registered?.getPtyIdForPane(numericPaneId) ?? savedPtyIdsByLeafId[leafId] ?? null)
    const legacyPaneId = numericPaneId === null ? /^pane:(\d+)$/.exec(leafId)?.[1] : null
    const paneTitle =
      numericPaneId !== null
        ? paneTitles[numericPaneId]
        : legacyPaneId
          ? paneTitles[Number(legacyPaneId)]
          : undefined
    const paneKey = isTerminalLeafId(leafId) ? makePaneKey(terminal.id, leafId) : null
    const title = resolveRuntimeTerminalTitle(
      terminal,
      generatedTitlesEnabled,
      paneTitle ?? terminal.title ?? 'Terminal'
    )
    const agentStatusTitle = paneTitle ?? terminal.title ?? ''
    const agentStatus =
      paneKey && !isClaudeManagementTitle(agentStatusTitle)
        ? state.agentStatusByPaneKey?.[paneKey]
        : undefined
    return {
      type: 'terminal' as const,
      id: mobileTerminalSurfaceId(terminal.id, leafId),
      title,
      ...(terminal.quickCommandLabel?.trim()
        ? { quickCommandLabel: terminal.quickCommandLabel.trim() }
        : {}),
      parentTabId: terminal.id,
      leafId,
      ptyId,
      ...(terminalTheme ? { terminalTheme } : {}),
      ...(agentStatus ? { agentStatus } : {}),
      ...(terminal.launchAgent ? { launchAgent: terminal.launchAgent } : {}),
      parentLayout,
      isActive: isDesktopTabActive && leafId === activeLeafId
    }
  })
}
