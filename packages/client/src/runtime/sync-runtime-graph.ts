export {
  canSkipRuntimeMobileSessionSyncKeyBuild,
  getRuntimeMobileSessionSyncKey,
  runtimeMobileSessionSyncKeysEqual
} from './runtime-mobile-session-sync-key'
export type { RuntimeMobileSessionSyncKey } from './runtime-mobile-session-sync-key'
import { isTerminalLeafId } from '@yiru/protocol/terminal/pane-identity'
import type { RuntimeSyncWindowGraph } from '~renderer/runtime/status/window-graph'
import type { AppState } from '~renderer/store/types'
import { serializePaneTree } from '~renderer/terminal-pane/layout-serialization'
import { warnTerminalLifecycleAnomaly } from '~renderer/terminal-pane/terminal-lifecycle-diagnostics'
import { getSystemPrefersDark } from '~renderer/terminal/theme'

import { resolveTerminalLayoutRoot } from './remote-terminal-layout-resolution'
import { buildMobileSessionTabSnapshots } from './runtime-mobile-session-snapshot'
import {
  focusRuntimeTerminalSurface as focusRegisteredRuntimeTerminalSurface,
  getRegisteredRuntimeTerminalTabs,
  hasRegisteredRuntimeTerminalTab as hasRegisteredTerminalTab,
  registerRuntimeTerminalTab as registerRuntimeTerminal
} from './runtime-terminal-registry'
import type { RegisteredRuntimeTerminalTab } from './runtime-terminal-registry'
import { resolveRuntimeTerminalTitle } from './runtime-terminal-title'
import { isWebOnlyMirroredTerminalTab } from './runtime-terminal-visibility'
import { shellClient } from './shell-client'

const NO_TRANSPORT_GRACE_MS = 10_000
const RUNTIME_GRAPH_SYNC_COALESCE_MS = 16
let syncScheduled = false
let syncInFlight = false
let syncPendingAfterFlight = false
let syncEnabled = false
let syncTimer: ReturnType<typeof setTimeout> | null = null
let getStoreState: (() => AppState) | null = null
export function setRuntimeGraphStoreStateGetter(getter: (() => AppState) | null): void {
  getStoreState = getter
}

/** True while a TerminalPane for this tab is mounted (lifecycle effect ran). */
export function hasRegisteredRuntimeTerminalTab(tabId: string): boolean {
  return hasRegisteredTerminalTab(tabId)
}

export function registerRuntimeTerminalTab(tab: RegisteredRuntimeTerminalTab): () => void {
  return registerRuntimeTerminal(tab, scheduleRuntimeGraphSync)
}

export function focusRuntimeTerminalSurface(tabId: string, leafId?: string | null): boolean {
  return focusRegisteredRuntimeTerminalSurface(tabId, leafId, scheduleRuntimeGraphSync)
}

export function setRuntimeGraphSyncEnabled(enabled: boolean): void {
  syncEnabled = enabled
  if (!enabled) {
    syncPendingAfterFlight = false
    clearScheduledRuntimeGraphSync()
    return
  }
  scheduleRuntimeGraphSync()
}

function clearScheduledRuntimeGraphSync(): void {
  if (syncTimer !== null) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  syncScheduled = false
}

export function scheduleRuntimeGraphSync(): void {
  if (!syncEnabled || syncScheduled) {
    return
  }
  if (syncInFlight) {
    syncPendingAfterFlight = true
    return
  }
  syncScheduled = true
  // Why: terminal title/status updates often arrive as separate IPC tasks.
  // A frame-sized timer collapses that churn into one graph publish without
  // tying runtime state publication to paint frames or visible-window status.
  syncTimer = setTimeout(() => {
    syncTimer = null
    syncScheduled = false
    void runRuntimeGraphSync()
  }, RUNTIME_GRAPH_SYNC_COALESCE_MS)
}

async function runRuntimeGraphSync(): Promise<void> {
  if (syncInFlight) {
    syncPendingAfterFlight = true
    return
  }
  syncInFlight = true
  try {
    await syncRuntimeGraph()
  } finally {
    syncInFlight = false
    if (syncPendingAfterFlight) {
      syncPendingAfterFlight = false
      // Why: syncWindowGraph crosses IPC and can be slower than title/layout
      // churn. Collapse all updates that arrived during one in-flight sync
      // into a single trailing graph instead of stacking concurrent IPC calls.
      scheduleRuntimeGraphSync()
    }
  }
}

async function syncRuntimeGraph(): Promise<void> {
  if (!syncEnabled || !getStoreState) {
    return
  }
  // Why: the runtime graph helper cannot import the Zustand store directly
  // because the terminal slice also imports this module to schedule syncs.
  // Injecting the getter from App keeps the runtime graph path out of the
  // store construction cycle and avoids test-time partial initialization.
  const state = getStoreState()
  const systemPrefersDark = getSystemPrefersDark()
  // Why: sync can run after high-churn terminal/title mutations. Build lookup
  // maps once per sync instead of flattening every worktree's tabs for each
  // registered terminal.
  const terminalTabById = new Map(
    Object.values(state.tabsByWorktree)
      .flat()
      .map((tab) => [tab.id, tab])
  )
  const generatedTitlesEnabled = state.settings?.tabAutoGenerateTitle === true
  const graph: RuntimeSyncWindowGraph = {
    tabs: [],
    leaves: [],
    mobileSessionTabs: buildMobileSessionTabSnapshots(state, systemPrefersDark)
  }

  for (const [tabId, registration] of getRegisteredRuntimeTerminalTabs()) {
    const registeredTab = registration.tab
    const tab = terminalTabById.get(tabId)
    if (!tab) {
      continue
    }
    if (isWebOnlyMirroredTerminalTab(state, tab)) {
      continue
    }

    const manager = registeredTab.getManager()
    const container = registeredTab.getContainer()
    const activePaneId = manager?.getActivePane()?.id ?? null
    const root =
      container?.firstElementChild instanceof HTMLElement ? container.firstElementChild : null

    graph.tabs.push({
      tabId,
      worktreeId: registeredTab.worktreeId,
      title: resolveRuntimeTerminalTitle(tab, generatedTitlesEnabled),
      activeLeafId: activePaneId === null ? null : (manager?.getLeafId(activePaneId) ?? null),
      layout: serializePaneTree(root)
    })

    const savedPtyIdsByLeafId = state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId ?? {}
    for (const pane of manager?.getPanes() ?? []) {
      const leafId = pane.leafId
      const ptyId = registeredTab.getPtyIdForPane(pane.id)
      const savedPtyId = savedPtyIdsByLeafId[leafId] ?? null
      if (!ptyId && savedPtyId && Date.now() - registration.registeredAt > NO_TRANSPORT_GRACE_MS) {
        warnTerminalLifecycleAnomaly('mounted terminal leaf has saved PTY but no live transport', {
          tabId,
          worktreeId: registeredTab.worktreeId,
          leafId,
          paneId: pane.id,
          ptyId: savedPtyId
        })
      }
      const paneTitles = state.runtimePaneTitlesByTabId[tabId] ?? {}
      graph.leaves.push({
        tabId,
        worktreeId: registeredTab.worktreeId,
        leafId,
        paneRuntimeId: pane.id,
        ptyId,
        paneTitle: paneTitles[pane.id] ?? null,
        title: resolveRuntimeTerminalTitle(
          tab,
          generatedTitlesEnabled,
          state.runtimePaneTitlesByTabId[tabId]?.[pane.id] ?? tab.title
        )
      })
    }
  }

  // Why: background tabs spawn their agent PTY eagerly and are created
  // inactive, so they never mount a TerminalPane and never enter `registeredTabs`.
  // Without this pass their leaf+ptyId is never published, so the runtime treats
  // the live agent PTY as orphaned (surfaced as a synthetic `pty:<id>` terminal)
  // and `yiru terminal list` / session-reuse can't see the real tab. Publish them
  // from the persisted layout, gated on a live eager buffer so we only adopt a
  // still-running unmounted PTY (never a stale saved ptyId).
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    for (const tab of tabs) {
      if (hasRegisteredTerminalTab(tab.id) || isWebOnlyMirroredTerminalTab(state, tab)) {
        continue
      }
      const layout = state.terminalLayoutsByTabId[tab.id]
      const savedPtyIdsByLeafId = layout?.ptyIdsByLeafId
      if (!savedPtyIdsByLeafId) {
        continue
      }
      const liveLeaves = Object.entries(savedPtyIdsByLeafId).filter(
        ([leafId, ptyId]) =>
          typeof ptyId === 'string' && ptyId.length > 0 && isTerminalLeafId(leafId)
      )
      if (liveLeaves.length === 0) {
        continue
      }
      const title = resolveRuntimeTerminalTitle(tab, generatedTitlesEnabled)
      graph.tabs.push({
        tabId: tab.id,
        worktreeId,
        title,
        activeLeafId: layout?.activeLeafId ?? liveLeaves[0][0],
        layout: resolveTerminalLayoutRoot({
          authoritativeRoot: layout?.root,
          leafIds: liveLeaves.map(([leafId]) => leafId),
          onSynthesize: (leafCount) =>
            console.warn(
              `[sync-runtime-graph] synthesized layout for ${leafCount} unmounted leaves with no saved tree`
            )
        })
      })
      liveLeaves.forEach(([leafId, ptyId], index) => {
        graph.leaves.push({
          tabId: tab.id,
          worktreeId,
          leafId,
          paneRuntimeId: index + 1,
          ptyId,
          paneTitle: null,
          title
        })
      })
    }
  }

  try {
    await shellClient.runtime.syncWindowGraph(graph)
    // Why: the legacy JSON result carried an optional orchestration map the
    // protobuf status response has no field for; the Rust authority never
    // populated it, so the renderer keeps its empty map exactly as before.
    getStoreState()?.setRuntimeAgentOrchestrationByPaneKey?.({})
  } catch (error) {
    console.error('[runtime] Failed to sync renderer graph:', error)
  }
}
