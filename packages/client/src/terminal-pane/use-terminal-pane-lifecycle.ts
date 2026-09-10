import { normalizeDesktopTerminalScrollbackRows } from '@agentstart/protocol/terminal/scrollback-policy'
import { useEffect } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import {
  registerRuntimeTerminalTab,
  scheduleRuntimeGraphSync
} from '~renderer/runtime/sync-runtime-graph'
import { useAppStore } from '~renderer/store/state'
import { configureTerminalOutputBacklogCap } from '~renderer/terminal-pane/pane-manager/pane-terminal-output-scheduler'

import { cleanupTerminalPaneManager } from './cleanup-terminal-pane-manager'
import { createTerminalPaneManager } from './create-terminal-pane-manager'
import { createTerminalPanePtyDeps } from './create-terminal-pane-pty-deps'
import { createTerminalPaneRuntime } from './create-terminal-pane-runtime'
import { installTerminalPaneCommandEvents } from './install-terminal-pane-command-events'
import { normalizeTerminalLayoutSnapshot } from './layout-serialization'
import { resolveTerminalPaneLaunchContext } from './resolve-terminal-pane-launch-context'
import { restoreTerminalPaneLayout } from './restore-terminal-pane-layout'
import { getTerminalFileOpenHint, getTerminalUrlOpenHint } from './terminal-link-open-hints'
import { splitPaneWithOneShotStartup } from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'
import { useTerminalCodexRestart } from './use-terminal-codex-restart'
import { useTerminalPaneAppearance } from './use-terminal-pane-appearance'
import { useTerminalPaneResources } from './use-terminal-pane-resources'
import { useTerminalPaneVisibility } from './use-terminal-pane-visibility'

/** Wires mounted terminal panes to renderer state and terminal event handling. */
export function useTerminalPaneLifecycle(deps: UseTerminalPaneLifecycleDeps): void {
  useTerminalCodexRestart(deps)
  const {
    tabId,
    worktreeId,
    cwd,
    startup,
    setupSplit,
    isActive,
    isVisible,
    systemPrefersDark,
    settings,
    settingsRef,
    effectiveMacOptionAsAlt,
    effectiveMacOptionAsAltRef,
    initialLayoutRef,
    managerRef,
    containerRef,
    expandedStyleSnapshotRef,
    paneFontSizesRef,
    paneTransportsRef,
    paneCwdRef,
    paneMode2031Ref,
    paneLastThemeModeRef,
    panePtyBindingsRef,
    replayingPanesRef,
    isVisibleRef,
    setTabPaneExpanded,
    setTabCanExpandPane,
    setExpandedPane,
    persistLayoutSnapshot,
    setPaneTitles,
    paneTitlesRef,
    setPaneCount,
    setPaneLayoutRevision,
    setPaneSnapshot
  } = deps
  const terminalScrollbackRows = normalizeDesktopTerminalScrollbackRows(
    settings?.terminalScrollbackRows
  )
  // Why here: the output scheduler's backlog cap scales with the same
  // scrollback setting; applying it where the setting is read keeps the two
  // in lockstep without a separate settings subscription.
  configureTerminalOutputBacklogCap(settings?.terminalScrollbackRows)
  const resources = useTerminalPaneResources()

  const applyAppearance = useTerminalPaneAppearance({
    effectiveMacOptionAsAlt,
    effectiveMacOptionAsAltRef,
    managerRef,
    mouseHideDisposablesRef: resources.mouseHideDisposablesRef,
    paneFontSizesRef,
    paneLastThemeModeRef,
    paneMode2031Ref,
    paneTransportsRef,
    settings,
    settingsRef,
    systemPrefersDark,
    terminalScrollbackRows
  })
  useTerminalPaneVisibility({
    cwd,
    isActive,
    isVisible,
    isVisibleRef,
    managerRef,
    panePtyBindingsRef,
    tabId,
    worktreeId
  })

  const mountTerminalPane = useEventCallback(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const expandedStyleSnapshots = expandedStyleSnapshotRef.current
    const paneTransports = paneTransportsRef.current
    const panePtyBindings = panePtyBindingsRef.current
    const disposableMaps = [
      resources.linkProviderDisposablesRef.current,
      resources.terminalHandleLinkDisposablesRef.current,
      resources.fileLinkClickFallbackDisposablesRef.current,
      resources.httpLinkClickFallbackDisposablesRef.current,
      resources.selectionDisposablesRef.current,
      resources.mouseHideDisposablesRef.current,
      resources.imeCompositionDisposablesRef.current,
      resources.imeNativeTextForwarderDisposablesRef.current
    ]
    const selectionCaptureTimers = resources.selectionCaptureTimersRef.current
    const { defaultTabCwd, getPaneLinkCwd, linkDeps, osc7UncHost, startupCwd } =
      resolveTerminalPaneLaunchContext({
        cwd,
        linkProviderDisposablesRef: resources.linkProviderDisposablesRef,
        managerRef,
        paneCwdRef,
        paneTransportsRef,
        queuedInitialCwdRef: resources.queuedInitialCwdRef,
        startup,
        tabId,
        worktreeId
      })
    const {
      cancelQueuedResize,
      queueResizeAll,
      syncCanExpandState,
      syncPaneCount,
      syncPaneLayoutRevision
    } = createTerminalPaneRuntime({
      managerRef,
      setPaneCount,
      setPaneLayoutRevision,
      setPaneSnapshot,
      setTabCanExpandPane,
      tabId
    })

    const normalizedInitialLayout = normalizeTerminalLayoutSnapshot(initialLayoutRef.current)
    if (normalizedInitialLayout.changed) {
      initialLayoutRef.current = normalizedInitialLayout.snapshot
      useAppStore.getState().setTabLayout(tabId, normalizedInitialLayout.snapshot)
    }
    let shouldPersistLayout = false
    const ptyDeps = createTerminalPanePtyDeps({
      deps,
      restoredViewportBlankingPanesRef: resources.restoredViewportBlankingPanesRef,
      startupCwd
    })

    const unregisterRuntimeTab = registerRuntimeTerminalTab({
      tabId,
      worktreeId,
      getManager: () => managerRef.current,
      getContainer: () => containerRef.current,
      getPtyIdForPane: (paneId) => paneTransportsRef.current.get(paneId)?.getPtyId() ?? null
    })

    const fileOpenLinkHint = getTerminalFileOpenHint()
    const urlOpenLinkHint = getTerminalUrlOpenHint()
    const manager = createTerminalPaneManager({
      applyAppearance,
      container,
      defaultTabCwd,
      deps,
      fileOpenLinkHint,
      getPaneLinkCwd,
      linkDeps,
      osc7UncHost,
      ptyDeps,
      resources,
      runtime: {
        cancelQueuedResize,
        queueResizeAll,
        syncCanExpandState,
        syncPaneCount,
        syncPaneLayoutRevision
      },
      shouldPersistLayout: () => shouldPersistLayout,
      startupCwd,
      urlOpenLinkHint
    })

    managerRef.current = manager
    restoreTerminalPaneLayout({
      containerRef,
      expandedStyleSnapshotRef,
      initialLayoutRef,
      isActive,
      manager,
      managerRef,
      paneTitlesRef,
      replayingPanesRef,
      restoredViewportBlankingPanesRef: resources.restoredViewportBlankingPanesRef,
      setExpandedPane,
      setPaneTitles,
      tabId,
      worktreeId
    })
    // Why: setup split creates a right-side pane for the setup script so the
    // main (left) terminal stays immediately usable. We inject the setup command
    // into ptyDeps.startup right before splitting and clear it immediately after
    // — connectPanePty receives a spread copy (`{...ptyDeps}`), so mutations
    // inside connectPanePty don't propagate back to ptyDeps. Without clearing
    // here, any later user-initiated split (e.g. Cmd+D) would re-run the setup
    // command in the newly created pane.
    // Why: capture the main shell pane *before* any splits mutate the pane list.
    // The setup path restores focus after creating its split, so save the main pane rather
    // than relying on getPanes()[0] which returns insertion order, not visual order.
    const initialPane = manager.getActivePane() ?? manager.getPanes()[0]

    // Why: setup panes are internal workspace bootstrap flows,
    // not the user-initiated terminal split interaction recorded below.
    if (setupSplit) {
      if (initialPane) {
        splitPaneWithOneShotStartup(
          ptyDeps,
          { command: setupSplit.command, env: setupSplit.env },
          () => manager.splitPane(initialPane.id, setupSplit.direction)
        )
        // Restore focus to the main pane so the user's terminal receives
        // keyboard input — the setup pane runs unattended.
        manager.setActivePane(initialPane.id, { focus: isActive })
      }
    }

    shouldPersistLayout = true
    syncCanExpandState()
    syncPaneCount()
    applyAppearance(manager)
    queueResizeAll(isActive)
    persistLayoutSnapshot()
    scheduleRuntimeGraphSync()

    const removeCommandEventListeners = installTerminalPaneCommandEvents({
      isActive,
      managerRef,
      persistLayoutSnapshot,
      ptyDeps,
      queueResizeAll,
      syncCanExpandState,
      tabId
    })

    return () => {
      cleanupTerminalPaneManager({
        cancelQueuedResize,
        disposableMaps,
        expandedStyleSnapshots,
        manager,
        managerRef,
        panePtyBindings,
        paneTransports,
        removeCommandEventListeners,
        selectionCaptureTimers,
        setTabCanExpandPane,
        setTabPaneExpanded,
        tabId,
        unregisterRuntimeTab,
        worktreeId
      })
    }
  })

  // Why: a terminal runtime is scoped to the tab and working directory. Other
  // values are read from the latest render when a new runtime is mounted.
  useEffect(() => mountTerminalPane(), [cwd, mountTerminalPane, tabId])
}
