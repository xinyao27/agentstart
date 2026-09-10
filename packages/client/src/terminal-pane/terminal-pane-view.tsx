import type { KeybindingOverrides } from '@agentstart/protocol/keybindings'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AgentSessionContinuationDialog } from '~renderer/agent-session-continuation/dialog'
import type { DaemonActionsApi } from '~renderer/daemon-actions/use-actions'
import { DaemonActionDialog } from '~renderer/daemon-actions/use-actions'
import {
  DEFAULT_TERMINAL_DIVIDER_DARK,
  isTerminalBackgroundLight,
  normalizeColor,
  resolveEffectiveTerminalAppearance,
  resolveOpaqueTerminalBackground
} from '~renderer/terminal/theme'
import { ContextMenu, ContextMenuTrigger } from '~renderer/ui/context-menu'
import { WORKSPACE_FILE_PATH_MIME, WORKSPACE_FILE_PATHS_MIME } from '~renderer/workspace/file-drag'

import type { AgentSessionContinuationRequest } from './agent/session-continuation'
import CloseTerminalDialog from './close-terminal-dialog'
import { handleInternalTerminalFileDrop } from './drop/handler'
import TerminalPaneHeaderOverlay from './header-overlay'
import type { SearchState } from './keyboard-handlers'
import type { ManagedPane, PaneManager } from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'
import TerminalSearch from './search/panel'
import { SessionRestoredBannerPortals } from './session-restored-banner-portals'
import { splitTerminalPaneWithInheritedCwd } from './split-with-inherited-cwd'
import { canContinueAgentSessionInNewSession } from './terminal-agent-session-continuation'
import type { PreparedAgentSessionFork } from './terminal-agent-session-fork'
import { TerminalAgentSessionForkDialog } from './terminal-agent-session-fork-dialog'
import TerminalContextMenu from './terminal-context-menu'
import { createTerminalMenuOpenChangeHandler } from './terminal-context-menu-dismiss'
import { TerminalDriverPortals } from './terminal-driver-portals'
import { TerminalQuickCommandEditor } from './terminal-quick-command-editor'
import { TerminalSessionStateSaveFailureDialog } from './terminal-session-state-save-failure-dialog'
import type { TerminalTabAgentTypesByLeaf } from './terminal-tab-agent-type-index'
import type { useTerminalFitRestore } from './use-terminal-fit-restore'
import type { useTerminalPaneClose } from './use-terminal-pane-close'
import type { useTerminalPaneContextMenu } from './use-terminal-pane-context-menu'
import type { useTerminalPaneHeaderChrome } from './use-terminal-pane-header-chrome'
import type { useTerminalPaneRename } from './use-terminal-pane-rename'
import type { useTerminalPrimarySelectionPaste } from './use-terminal-primary-selection-paste'
import type { useTerminalQuickCommandMenu } from './use-terminal-quick-command-menu'

type TerminalContainerStyle = CSSProperties & {
  '--agentstart-terminal-divider-color': string
  '--agentstart-terminal-divider-color-strong': string
}

type TerminalPaneViewProps = {
  activePane: ManagedPane | null
  agentSessionContinuation: AgentSessionContinuationRequest | null
  agentSessionFork: PreparedAgentSessionFork | null
  contextMenu: ReturnType<typeof useTerminalPaneContextMenu>
  cwd?: string
  daemonActions: DaemonActionsApi
  expectedLayoutLeafIdsAttr: string | undefined
  expandedPaneId: number | null
  fitRestore: ReturnType<typeof useTerminalFitRestore>
  headerChrome: ReturnType<typeof useTerminalPaneHeaderChrome>
  isActive: boolean
  isVisible: boolean
  keybindings: KeybindingOverrides
  managerRef: React.RefObject<PaneManager | null>
  onOpenSpaceAnalyzer: () => void
  paneClose: ReturnType<typeof useTerminalPaneClose>
  paneCount: number
  paneCwdRef: React.RefObject<Map<number, { cwd: string; confirmed: boolean }>>
  panePtyIds: ReadonlyMap<number, string>
  paneTitles: Record<number, string>
  panes: ManagedPane[]
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  primarySelection: ReturnType<typeof useTerminalPrimarySelectionPaste>
  quickCommands: ReturnType<typeof useTerminalQuickCommandMenu>
  rename: ReturnType<typeof useTerminalPaneRename>
  searchOpen: boolean
  searchStateRef: React.RefObject<SearchState>
  sessionStateSaveFailureOpen: boolean
  setAgentSessionContinuation: React.Dispatch<
    React.SetStateAction<AgentSessionContinuationRequest | null>
  >
  setAgentSessionFork: React.Dispatch<React.SetStateAction<PreparedAgentSessionFork | null>>
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  setSessionStateSaveFailureOpen: React.Dispatch<React.SetStateAction<boolean>>
  settings: GlobalSettings | null | undefined
  shouldMeasureHiddenStartup: boolean
  showSplitButton: boolean
  systemPrefersDark: boolean
  tab: TerminalTab | null
  tabAgentTypeByLeaf: TerminalTabAgentTypesByLeaf
  tabId: string
  worktreeId: string
}

export function TerminalPaneView(props: TerminalPaneViewProps): React.JSX.Element {
  const {
    contextMenu,
    managerRef,
    paneTransportsRef,
    quickCommands,
    rename,
    settings,
    systemPrefersDark
  } = props
  const {
    handleRemoveTitle,
    handleRenameBlur,
    handleRenameCancel,
    handleRenameSubmit,
    handleStartRename,
    renameInputRef,
    renameValue,
    renamingPaneId,
    setContainerRef,
    setRenameValue
  } = rename
  const { activePane, panes } = props
  const contextMenuLeafId =
    contextMenu.menuPaneId === null
      ? (activePane?.leafId ?? null)
      : (panes.find((pane) => pane.id === contextMenu.menuPaneId)?.leafId ?? null)
  const resolveAgentForLeaf = (leafId: string | null): string | null => {
    const detectedAgent = leafId ? props.tabAgentTypeByLeaf[leafId] : undefined
    return detectedAgent ?? props.tab?.launchAgent ?? null
  }
  const activePaneCanContinue = canContinueAgentSessionInNewSession(
    resolveAgentForLeaf(activePane?.leafId ?? null)
  )
  const contextMenuCanContinue = canContinueAgentSessionInNewSession(
    resolveAgentForLeaf(contextMenuLeafId)
  )
  const handleContextMenuOpenChange = createTerminalMenuOpenChangeHandler({
    menuOpenedAtRef: contextMenu.menuOpenedAtRef,
    setOpen: contextMenu.setOpen
  })

  const appearance = settings
    ? resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
    : null
  const terminalBackground =
    settings?.terminalColorOverrides?.background ?? appearance?.theme?.background
  const titleUsesLightSurface = isTerminalBackgroundLight(terminalBackground, {
    appSurface: appearance?.mode,
    backgroundOpacity: settings?.terminalBackgroundOpacity
  })
  const paneTitleBackground =
    resolveOpaqueTerminalBackground(terminalBackground, {
      appSurface: appearance?.mode,
      backgroundOpacity: settings?.terminalBackgroundOpacity
    }) ?? (titleUsesLightSurface ? '#ffffff' : '#000000')
  const terminalContentVisible = props.isVisible || props.shouldMeasureHiddenStartup
  const hiddenStartupStyle: CSSProperties = props.shouldMeasureHiddenStartup
    ? { opacity: 0, pointerEvents: 'none' }
    : {}
  const terminalContainerStyle: TerminalContainerStyle = {
    display: terminalContentVisible ? 'flex' : 'none',
    overflow: 'hidden',
    ...hiddenStartupStyle,
    '--agentstart-terminal-divider-color':
      appearance?.dividerColor ?? DEFAULT_TERMINAL_DIVIDER_DARK,
    '--agentstart-terminal-divider-color-strong': normalizeColor(
      appearance?.dividerColor,
      DEFAULT_TERMINAL_DIVIDER_DARK
    )
  }
  const quickCommandRepoId = quickCommands.repoId

  const splitPane = (pane: (typeof panes)[number], direction: 'vertical' | 'horizontal'): void => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    splitTerminalPaneWithInheritedCwd({
      manager,
      getManager: () => managerRef.current,
      paneTransports: paneTransportsRef.current,
      paneCwdMap: props.paneCwdRef.current,
      fallbackCwd: props.cwd ?? '',
      pane,
      direction,
      source: 'context_menu'
    })
  }

  return (
    <ContextMenu open={contextMenu.open} onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger
        ref={setContainerRef}
        className="absolute inset-0 min-h-0 min-w-0"
        data-terminal-tab-id={props.tabId}
        data-terminal-layout-leaf-ids={props.expectedLayoutLeafIdsAttr}
        data-pane-title-surface={titleUsesLightSurface ? 'light' : 'dark'}
        style={terminalContainerStyle}
        onContextMenu={contextMenu.onContextMenu}
        onMouseDownCapture={props.primarySelection.onMouseDown}
        onAuxClickCapture={props.primarySelection.onAuxClick}
        onDragOver={(event) => {
          if (
            event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME) ||
            event.dataTransfer.types.includes(WORKSPACE_FILE_PATHS_MIME)
          ) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={(event) => {
          if (
            !event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME) &&
            !event.dataTransfer.types.includes(WORKSPACE_FILE_PATHS_MIME)
          ) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          const manager = managerRef.current
          if (manager) {
            void handleInternalTerminalFileDrop({
              manager,
              paneTransports: paneTransportsRef.current,
              worktreeId: props.worktreeId,
              tabId: props.tabId,
              cwd: props.cwd,
              dataTransfer: event.dataTransfer,
              dropTarget: event.target
            })
          }
        }}
      />
      <DaemonActionDialog api={props.daemonActions} />
      {props.isActive && (
        <TerminalSessionStateSaveFailureDialog
          open={props.sessionStateSaveFailureOpen}
          onDismiss={() => props.setSessionStateSaveFailureOpen(false)}
          onOpenSpaceAnalyzer={props.onOpenSpaceAnalyzer}
        />
      )}
      {activePane?.container &&
        createPortal(
          <TerminalSearch
            isOpen={props.searchOpen}
            onClose={() => props.setSearchOpen(false)}
            searchAddon={activePane.searchAddon ?? null}
            searchStateRef={props.searchStateRef}
          />,
          activePane.container
        )}
      <SessionRestoredBannerPortals
        panes={panes}
        paneIds={props.headerChrome.sessionRestoredBannerPaneIds}
      />
      <TerminalContextMenu
        onForceClose={() => contextMenu.setOpen(false)}
        canClosePane={contextMenu.paneCount > 1}
        canExpandPane={contextMenu.paneCount > 1}
        canEqualizePaneSizes={contextMenu.paneCount > 1 && props.expandedPaneId === null}
        menuPaneIsExpanded={
          contextMenu.menuPaneId !== null && contextMenu.menuPaneId === props.expandedPaneId
        }
        onCopy={() => void contextMenu.onCopy()}
        onPaste={() => void contextMenu.onPaste()}
        onSplitRight={contextMenu.onSplitRight}
        onSplitDown={contextMenu.onSplitDown}
        keybindings={props.keybindings}
        onEqualizePaneSizes={contextMenu.onEqualizePaneSizes}
        onClosePane={contextMenu.onClosePane}
        onClearScreen={contextMenu.onClearScreen}
        canContinueAgentSessionInNewSession={contextMenuCanContinue}
        onContinueAgentSessionInNewSession={contextMenu.onContinueAgentSessionInNewSession}
        onForkAgentSession={() => void contextMenu.onForkAgentSession()}
        onCopyAgentSessionContext={() => void contextMenu.onCopyAgentSessionContext()}
        repoQuickCommands={quickCommands.repoCommands}
        globalQuickCommands={quickCommands.globalCommands}
        quickCommandRepoLabel={quickCommands.repoLabel}
        onQuickCommand={contextMenu.onQuickCommand}
        onAddQuickCommand={
          quickCommandRepoId
            ? () => quickCommands.openEditor({ type: 'repo', repoId: quickCommandRepoId })
            : () => quickCommands.openEditor({ type: 'global' })
        }
        onToggleExpand={contextMenu.onToggleExpand}
        onSetTitle={contextMenu.onSetTitle}
        onClearPaneTitle={contextMenu.onClearPaneTitle}
        canClearPaneTitle={
          contextMenu.menuPaneId !== null && Boolean(props.paneTitles[contextMenu.menuPaneId])
        }
        onCopyTerminalId={() => void contextMenu.onCopyTerminalId()}
        onCopyPaneId={contextMenu.onCopyPaneId}
      />
      {quickCommands.editorOpen ? (
        <TerminalQuickCommandEditor
          command={quickCommands.quickCommandDraft}
          onOpenChange={quickCommands.setEditorOpen}
          onSave={quickCommands.saveQuickCommand}
        />
      ) : null}
      <TerminalAgentSessionForkDialog
        open={props.agentSessionFork !== null}
        fork={props.agentSessionFork}
        onOpenChange={(open) => !open && props.setAgentSessionFork(null)}
      />
      {props.agentSessionContinuation ? (
        <AgentSessionContinuationDialog
          open
          request={props.agentSessionContinuation}
          onOpenChange={(open) => !open && props.setAgentSessionContinuation(null)}
        />
      ) : null}
      <TerminalPaneHeaderOverlay
        tabId={props.tabId}
        worktreeId={props.worktreeId}
        cwd={props.cwd ?? ''}
        showAlwaysOnHeaders={props.isActive && terminalContentVisible}
        showSplitButton={props.showSplitButton}
        paneCount={props.paneCount}
        activePaneId={activePane?.id}
        panes={panes}
        paneTitles={props.paneTitles}
        paneTitleOverlayRects={props.headerChrome.paneTitleOverlayRects}
        renamingPaneId={renamingPaneId}
        renameValue={renameValue}
        renameInputRef={renameInputRef}
        titleUsesLightSurface={titleUsesLightSurface}
        paneTitleBackground={paneTitleBackground}
        terminalContentVisible={terminalContentVisible}
        hiddenStartupStyle={hiddenStartupStyle}
        managerRef={managerRef}
        paneTransportsRef={paneTransportsRef}
        canContinueAgentSessionInNewSession={activePaneCanContinue}
        onContinueAgentSessionInNewSession={(pane) =>
          contextMenu.runForPane(pane.id, contextMenu.onContinueAgentSessionInNewSession)
        }
        onSplitPane={splitPane}
        onBeginPaneDrag={(paneId, handle, event) =>
          managerRef.current?.beginPaneDragFromPointerDown(paneId, handle, event)
        }
        onActivatePaneTitleInteraction={(paneId) =>
          managerRef.current?.setActivePane(paneId, { focus: false })
        }
        onPaneTitleContextMenu={contextMenu.onPaneTitleContextMenu}
        onStartRename={handleStartRename}
        onRemoveTitle={handleRemoveTitle}
        onClosePane={props.paneClose.handleRequestClosePane}
        onRenameValueChange={setRenameValue}
        onRenameSubmit={handleRenameSubmit}
        onRenameCancel={handleRenameCancel}
        onRenameBlur={handleRenameBlur}
      />
      <TerminalDriverPortals
        panes={panes}
        panePtyIds={props.panePtyIds}
        restoreAllTerminalFits={props.fitRestore.restoreAllTerminalFits}
        restorePaneTerminalFit={props.fitRestore.restorePaneTerminalFit}
      />
      <CloseTerminalDialog
        open={props.paneClose.pendingCloseConfirmation !== null}
        copyKind={props.paneClose.pendingCloseConfirmation?.copyKind}
        onCancel={props.paneClose.handleCancelClose}
        onConfirm={props.paneClose.handleConfirmClose}
      />
    </ContextMenu>
  )
}
