// Why: this component is the shared entry every lazy() boundary that mounts a
// real terminal goes through (workspace panels and onboarding's inline command
// terminal) — none of them are eager, so
// xterm's vendor stylesheet and our vendor-patch overrides only ship in that
// shared lazy chunk instead of the app's eager first-paint CSS.
import '@xterm/xterm/css/xterm.css'
import './terminal.css'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useEffectiveMacOptionAsAlt } from '~renderer/keyboard-layout/use-effective-mac-option-as-alt'
// Why: registry lives in a leaf module so the store slice can import it
// without re-entering the `slice → TerminalPane → store → slice` cycle
// that otherwise leaves createTerminalSlice undefined at store-init time.
import { showWorkspaceSidebar } from '~renderer/workspace-panel/show-sidebar'

import { createTerminalExternalDrop } from './create-terminal-external-drop'
import { createTerminalPtyLayoutBindings } from './create-terminal-pty-layout-bindings'
import { cancelPendingPaneSizeRefreshFrames, createExpandCollapseActions } from './expand-collapse'
import { useTerminalKeyboardShortcuts } from './keyboard-handlers'
import { reportTerminalPaneError } from './terminal-error-reporting'
import { TerminalPaneView } from './terminal-pane-view'
import type { MacOptionAsAlt } from './terminal-shortcut-policy'
import { useNotificationDispatch } from './use-notification-dispatch'
import { useRegularTerminalFocus } from './use-regular-terminal-focus'
import { useSystemPrefersDark } from './use-system-prefers-dark'
import { useTerminalFitRestore } from './use-terminal-fit-restore'
import { useTerminalLayoutPersistence } from './use-terminal-layout-persistence'
import { useTerminalLiveLayoutSync } from './use-terminal-live-layout-sync'
import { useTerminalPaneAttention } from './use-terminal-pane-attention'
import { useTerminalPaneClose } from './use-terminal-pane-close'
import { useTerminalPaneContextMenu } from './use-terminal-pane-context-menu'
import { useTerminalPaneGlobalEffects } from './use-terminal-pane-global-effects'
import { useTerminalPaneHeaderChrome } from './use-terminal-pane-header-chrome'
import { useTerminalPaneLifecycle } from './use-terminal-pane-lifecycle'
import { useTerminalPaneLocalState } from './use-terminal-pane-local-state'
import { useTerminalPanePaste } from './use-terminal-pane-paste'
import { useTerminalPaneRename } from './use-terminal-pane-rename'
import { useTerminalPaneStartup } from './use-terminal-pane-startup'
import { useTerminalPaneStore } from './use-terminal-pane-store'
import { useTerminalPrimarySelectionPaste } from './use-terminal-primary-selection-paste'
import { useTerminalQuickCommandMenu } from './use-terminal-quick-command-menu'
import { useTerminalShutdownCapture } from './use-terminal-shutdown-capture'
import { useTerminalTitleSanitization } from './use-terminal-title-sanitization'
import { useTerminalWebFit } from './use-terminal-web-fit'
import { useVisibleTerminalTabClaim } from './use-visible-terminal-tab-claim'

type TerminalPaneProps = {
  tabId: string
  worktreeId: string
  cwd?: string
  isActive: boolean
  isVisible?: boolean
  isWorktreeActive?: boolean
  // Why: ephemeral one-off command terminals don't need the regular pane header's
  // prominent split affordance, though standard split shortcuts remain available.
  showSplitButton?: boolean
  onPtyExit: (ptyId: string) => void
  onCloseTab: () => void
}

export default function TerminalPane({
  tabId,
  worktreeId,
  cwd,
  isActive,
  isVisible = true,
  isWorktreeActive = isVisible,
  showSplitButton = true,
  onPtyExit,
  onCloseTab
}: TerminalPaneProps): React.JSX.Element {
  const local = useTerminalPaneLocalState({
    isActive,
    isVisible,
    isWorktreeActive
  })
  useVisibleTerminalTabClaim({ isVisible, tabId })

  const paneStore = useTerminalPaneStore({ tabId, worktreeId })
  const { setupSplit, shouldMeasureHiddenStartup, startup } = useTerminalPaneStartup({
    isVisible,
    tabId
  })

  const openDiskSpaceAnalyzer = () => {
    local.setSessionStateSaveFailureOpen(false)
    paneStore.openSpacePage()
    void paneStore.refreshWorkspaceSpace().catch((err: unknown) => {
      console.warn('Failed to refresh Space Analyzer after terminal session save failure:', err)
    })
  }

  const quickCommands = useTerminalQuickCommandMenu({ tabId, worktreeId })

  const settingsRef = useRef(paneStore.settings)
  // Why: the persisted setting can be 'auto' (default) or one of the four
  // explicit modes. useEffectiveMacOptionAsAlt resolves 'auto' into
  // 'true' | 'false' based on the probe's current layout category (US → 'true',
  // anything else → 'false'), and re-renders when the OS layout changes.
  // Downstream keyboard handlers read the ref, so the ref also tracks the
  // effective value, not the raw setting.
  const effectiveMacOptionAsAlt = useEffectiveMacOptionAsAlt(
    paneStore.settings?.terminalMacOptionAsAlt
  )
  const macOptionAsAltRef = useRef<MacOptionAsAlt>(effectiveMacOptionAsAlt)
  const onPtyExitRef = useRef(onPtyExit)
  useLayoutEffect(() => {
    settingsRef.current = paneStore.settings
    macOptionAsAltRef.current = effectiveMacOptionAsAlt
    onPtyExitRef.current = onPtyExit
  }, [effectiveMacOptionAsAlt, onPtyExit, paneStore.settings])

  const systemPrefersDark = useSystemPrefersDark()
  const dispatchNotification = useNotificationDispatch(worktreeId)

  const {
    clearPaneScrollback,
    handleClearPaneTitleShortcut,
    persistLayoutSnapshot,
    removePaneTitle
  } = useTerminalLayoutPersistence({
    clearedScrollbackLeafIdsRef: local.clearedScrollbackLeafIdsRef,
    containerRef: local.containerRef,
    expandedPaneIdRef: local.expandedPaneIdRef,
    managerRef: local.managerRef,
    paneTitlesRef: local.paneTitlesRef,
    paneTransportsRef: local.paneTransportsRef,
    removedTitleLeafIdsRef: local.removedTitleLeafIdsRef,
    setPaneTitles: local.setPaneTitles,
    tabId,
    worktreeId
  })
  const rename = useTerminalPaneRename({
    containerRef: local.containerRef,
    managerRef: local.managerRef,
    onRemoveTitle: removePaneTitle,
    paneTitlesRef: local.paneTitlesRef,
    persistLayoutSnapshot,
    removedTitleLeafIdsRef: local.removedTitleLeafIdsRef,
    setPaneTitles: local.setPaneTitles
  })
  const headerChrome = useTerminalPaneHeaderChrome({
    containerRef: local.containerRef,
    expandedPaneId: local.expandedPaneId,
    isVisible,
    managerRef: local.managerRef,
    paneCount: local.paneCount,
    paneLayoutRevision: local.paneLayoutRevision,
    paneTitles: local.paneTitles,
    renamingPaneId: rename.renamingPaneId,
    shouldMeasureHiddenStartup
  })

  useTerminalTitleSanitization({
    managerRef: local.managerRef,
    paneCount: local.paneCount,
    paneTitles: local.paneTitles,
    paneTitlesRef: local.paneTitlesRef,
    persistLayoutSnapshot,
    savedLayout: paneStore.savedLayout,
    setPaneTitles: local.setPaneTitles,
    setTabLayout: paneStore.setTabLayout,
    tab: paneStore.terminalTab,
    tabId
  })

  const { clearExitedPanePtyLayoutBinding, syncPanePtyLayoutBinding } =
    createTerminalPtyLayoutBindings({ managerRef: local.managerRef, tabId })

  const {
    setExpandedPane,
    restoreExpandedLayout,
    refreshPaneSizes,
    syncExpandedLayout,
    toggleExpandPane
  } = createExpandCollapseActions({
    expandedPaneIdRef: local.expandedPaneIdRef,
    expandedStyleSnapshotRef: local.expandedStyleSnapshotRef,
    containerRef: local.containerRef,
    managerRef: local.managerRef,
    pendingPaneSizeRefreshFrameIdsRef: local.pendingPaneSizeRefreshFrameIdsRef,
    setExpandedPaneId: local.setExpandedPaneId,
    setTabPaneExpanded: paneStore.setTabPaneExpanded,
    tabId,
    persistLayoutSnapshot
  })

  const paneClose = useTerminalPaneClose({
    clearSessionRestoredBannerForPane: headerChrome.clearSessionRestoredBannerForPane,
    managerRef: local.managerRef,
    onCloseTab,
    paneTransportsRef: local.paneTransportsRef,
    syncPanePtyLayoutBinding,
    tabId,
    worktreeId
  })

  const handleSearchSelectedText = (selectedText: string): void => {
    showWorkspaceSidebar({
      view: 'explorer',
      worktreeId,
      explorerDestination: { view: 'search', query: selectedText }
    })
  }

  const { onExternalPaneDrop, resolveExternalPaneDropTarget } = createTerminalExternalDrop({
    managerRef: local.managerRef,
    paneTransportsRef: local.paneTransportsRef,
    persistLayoutSnapshot,
    tabId,
    worktreeId
  })

  useTerminalPaneLifecycle({
    ...local,
    ...paneStore,
    tabId,
    worktreeId,
    cwd,
    startup,
    setupSplit,
    isActive,
    isVisible: local.isRendererVisible,
    systemPrefersDark,
    settingsRef,
    effectiveMacOptionAsAlt,
    effectiveMacOptionAsAltRef: macOptionAsAltRef,
    onPtyExitRef,
    onShowSessionRestoredBanner: headerChrome.showRestoredSessionBanner,
    dispatchNotification,
    syncPanePtyLayoutBinding,
    clearExitedPanePtyLayoutBinding,
    setExpandedPane,
    syncExpandedLayout,
    persistLayoutSnapshot,
    setRenamingPaneId: rename.setRenamingPaneId,
    resolveExternalPaneDropTarget,
    onExternalPaneDrop
  })

  useTerminalLiveLayoutSync({
    isActive,
    managerRef: local.managerRef,
    paneCount: local.paneCount,
    persistLayoutSnapshot,
    restoredLayout: paneStore.restoredLayout
  })

  useEffect(() => {
    return () => {
      cancelPendingPaneSizeRefreshFrames({
        pendingPaneSizeRefreshFrameIdsRef: local.pendingPaneSizeRefreshFrameIdsRef
      })
    }
  }, [local.pendingPaneSizeRefreshFrameIdsRef])

  useTerminalKeyboardShortcuts({
    tabId,
    worktreeId,
    isActive,
    keyboardScopeRef: local.containerRef,
    managerRef: local.managerRef,
    paneTransportsRef: local.paneTransportsRef,
    panePtyBindingsRef: local.panePtyBindingsRef,
    paneCwdRef: local.paneCwdRef,
    fallbackCwd: cwd ?? '',
    expandedPaneIdRef: local.expandedPaneIdRef,
    setExpandedPane,
    restoreExpandedLayout,
    refreshPaneSizes,
    persistLayoutSnapshot,
    toggleExpandPane,
    setSearchOpen: local.setSearchOpen,
    onSearchSelectedText: handleSearchSelectedText,
    onRequestClosePane: paneClose.handleRequestClosePane,
    onClearPaneScrollback: clearPaneScrollback,
    onSetTitle: rename.handleStartRename,
    onClearPaneTitle: handleClearPaneTitleShortcut,
    searchOpenRef: local.searchOpenRef,
    searchStateRef: local.searchStateRef,
    macOptionAsAltRef,
    paneKittyKeyboardModesRef: local.paneKittyKeyboardModesRef,
    keybindings: paneStore.keybindings,
    terminalShortcutPolicy: paneStore.settings?.terminalShortcutPolicy ?? 'agentstart-first'
  })

  useTerminalPaneGlobalEffects({
    tabId,
    // Why: use the pane's own `worktreeId` prop (not global activeWorktreeId)
    // so the terminal-drop resolver routes to the worktree that actually owns
    // this PTY. Reading from global state would race during worktree switches
    // — the drop listener is already gated by `isActive`, and the pane's own
    // id is the authoritative identity of the terminal being written to.
    worktreeId,
    cwd,
    isActive,
    isVisible,
    isWorktreeActive,
    // Why: hidden startup probes are opacity-hidden but measurable; ordinary
    // hidden tabs are display:none and refit on visibility resume instead.
    isSyncFitEnabled: local.isRendererVisible || shouldMeasureHiddenStartup,
    paneCount: local.paneCount,
    managerRef: local.managerRef,
    containerRef: local.containerRef,
    paneTransportsRef: local.paneTransportsRef,
    isActiveRef: local.isActiveRef,
    isVisibleRef: local.isVisibleRef,
    toggleExpandPane
  })

  useTerminalWebFit({
    isActive,
    isVisible,
    managerRef: local.managerRef,
    paneTransportsRef: local.paneTransportsRef
  })
  useRegularTerminalFocus(local.containerRef)

  useTerminalPanePaste({
    containerRef: local.containerRef,
    forceBracketedMultilineTextPaste: paneStore.forceBracketedMultilineTextPaste,
    isActive,
    keybindings: paneStore.keybindings,
    managerRef: local.managerRef,
    paneTransportsRef: local.paneTransportsRef,
    tabId,
    worktreeId
  })

  useTerminalPaneAttention({
    clearTerminalPaneUnread: paneStore.clearTerminalPaneUnread,
    clearTerminalTabUnread: paneStore.clearTerminalTabUnread,
    clearWorktreeUnread: paneStore.clearWorktreeUnread,
    containerRef: local.containerRef,
    managerRef: local.managerRef,
    paneCount: local.paneCount,
    tabId,
    worktreeId
  })

  useTerminalShutdownCapture({
    clearedScrollbackLeafIdsRef: local.clearedScrollbackLeafIdsRef,
    containerRef: local.containerRef,
    expandedPaneIdRef: local.expandedPaneIdRef,
    managerRef: local.managerRef,
    paneTitlesRef: local.paneTitlesRef,
    paneTransportsRef: local.paneTransportsRef,
    tabId,
    worktreeId
  })

  const contextMenu = useTerminalPaneContextMenu({
    tabId,
    managerRef: local.managerRef,
    paneTransportsRef: local.paneTransportsRef,
    paneCwdRef: local.paneCwdRef,
    worktreeId,
    groupId: quickCommands.groupId,
    fallbackCwd: cwd ?? '',
    toggleExpandPane,
    onRequestClosePane: paneClose.handleRequestClosePane,
    onClearPaneScrollback: clearPaneScrollback,
    onSetTitle: rename.handleStartRename,
    onClearPaneTitle: handleClearPaneTitleShortcut,
    onPasteError: (message) => reportTerminalPaneError(message, 'terminal-paste'),
    onAgentSessionForkReady: local.setAgentSessionFork,
    onAgentSessionContinuationReady: local.setAgentSessionContinuation,
    forceBracketedMultilineTextPaste: paneStore.forceBracketedMultilineTextPaste,
    rightClickToPaste: paneStore.rightClickToPaste
  })
  const fitRestore = useTerminalFitRestore({
    paneTransportsRef: local.paneTransportsRef,
    refreshMobileFitState: local.refreshMobileFitState,
    settingsRef
  })
  const primarySelection = useTerminalPrimarySelectionPaste({
    managerRef: local.managerRef,
    paneTransportsRef: local.paneTransportsRef,
    tabId,
    worktreeId
  })

  return (
    <TerminalPaneView
      agentSessionContinuation={local.agentSessionContinuation}
      agentSessionFork={local.agentSessionFork}
      activePane={local.paneSnapshot.activePane}
      contextMenu={contextMenu}
      cwd={cwd}
      daemonActions={local.daemonActions}
      expectedLayoutLeafIdsAttr={paneStore.expectedLayoutLeafIdsAttr}
      expandedPaneId={local.expandedPaneId}
      fitRestore={fitRestore}
      headerChrome={headerChrome}
      isActive={isActive}
      isVisible={isVisible}
      keybindings={paneStore.keybindings}
      managerRef={local.managerRef}
      onOpenSpaceAnalyzer={openDiskSpaceAnalyzer}
      paneClose={paneClose}
      paneCount={local.paneCount}
      paneCwdRef={local.paneCwdRef}
      panePtyIds={local.panePtyIds}
      paneTitles={local.paneTitles}
      panes={local.paneSnapshot.panes}
      paneTransportsRef={local.paneTransportsRef}
      primarySelection={primarySelection}
      quickCommands={quickCommands}
      rename={rename}
      searchOpen={local.searchOpen}
      searchStateRef={local.searchStateRef}
      sessionStateSaveFailureOpen={local.sessionStateSaveFailureOpen}
      setAgentSessionContinuation={local.setAgentSessionContinuation}
      setAgentSessionFork={local.setAgentSessionFork}
      setSearchOpen={local.setSearchOpen}
      setSessionStateSaveFailureOpen={local.setSessionStateSaveFailureOpen}
      settings={paneStore.settings}
      shouldMeasureHiddenStartup={shouldMeasureHiddenStartup}
      showSplitButton={showSplitButton}
      systemPrefersDark={systemPrefersDark}
      tab={paneStore.terminalTab}
      tabAgentTypeByLeaf={paneStore.tabAgentTypeByLeaf}
      tabId={tabId}
      worktreeId={worktreeId}
    />
  )
}
