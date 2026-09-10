import { makePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import type { TerminalQuickCommand } from '@agentstart/protocol/terminal/quick-commands'
import type { BaseUIEvent } from '@base-ui/react/types'
import { useEffect } from 'react'
import { toast } from 'sonner'
import {
  REQUEST_ACTIVE_TERMINAL_PANE_SPLIT_EVENT,
  type RequestActiveTerminalPaneSplitDetail
} from '~renderer/constants/terminal'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import type { ManagedPane, PaneManager } from '~renderer/terminal-pane/pane-manager/pane-manager'

import type { AgentSessionContinuationRequest } from './agent/session-continuation'
import type { PtyTransport } from './pty/transport-types'
import type { PaneCwdMap } from './resolve-split-cwd'
import { splitTerminalPaneWithInheritedCwd } from './split-with-inherited-cwd'
import type { PreparedAgentSessionFork } from './terminal-agent-session-fork'
import { useTerminalContextMenuAgentActions } from './terminal-context-menu-agent-actions'
import { pasteFromTerminalContextMenu } from './terminal-context-menu-paste'
import { copyTerminalHandleForPane } from './terminal-handle-copy'
import { useTerminalContextMenuTarget } from './use-terminal-context-menu-target'

type UseTerminalPaneContextMenuDeps = {
  fallbackCwd: string
  forceBracketedMultilineTextPaste: boolean
  groupId: string | null
  managerRef: React.RefObject<PaneManager | null>
  onAgentSessionContinuationReady: (request: AgentSessionContinuationRequest) => void
  onAgentSessionForkReady: (fork: PreparedAgentSessionFork) => void
  onClearPaneScrollback: (pane: ManagedPane) => void
  onClearPaneTitle: (paneId: number) => void
  onPasteError: (message: string) => void
  onRequestClosePane: (paneId: number) => void
  onSetTitle: (paneId: number) => void
  paneCwdRef: React.RefObject<PaneCwdMap>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  rightClickToPaste: boolean
  tabId: string
  toggleExpandPane: (paneId: number) => void
  worktreeId: string
}

type TerminalMenuState = {
  menuOpenedAtRef: React.RefObject<number>
  menuPaneId: number | null
  onClearPaneTitle: () => void
  onClearScreen: () => void
  onClosePane: () => void
  onContextMenu: (event: BaseUIEvent<React.MouseEvent<HTMLDivElement>>) => void
  onContinueAgentSessionInNewSession: () => void
  onCopy: () => Promise<void>
  onCopyAgentSessionContext: () => Promise<void>
  onCopyPaneId: () => Promise<void>
  onCopyTerminalId: () => Promise<void>
  onEqualizePaneSizes: () => void
  onForkAgentSession: () => Promise<void>
  onPaneTitleContextMenu: (
    event: BaseUIEvent<React.MouseEvent<HTMLElement>>,
    paneId: number
  ) => void
  onPaste: () => Promise<void>
  onQuickCommand: (command: TerminalQuickCommand) => void
  onRelaunchAgentSession: () => void
  onSetTitle: () => void
  onSplitDown: () => void
  onSplitRight: () => void
  onToggleExpand: () => void
  open: boolean
  paneCount: number
  runForPane: <Result>(paneId: number, action: () => Result) => Result
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useTerminalPaneContextMenu({
  fallbackCwd,
  forceBracketedMultilineTextPaste,
  groupId,
  managerRef,
  onAgentSessionContinuationReady,
  onAgentSessionForkReady,
  onClearPaneScrollback,
  onClearPaneTitle,
  onPasteError,
  onRequestClosePane,
  onSetTitle,
  paneCwdRef,
  paneTransportsRef,
  rightClickToPaste,
  tabId,
  toggleExpandPane,
  worktreeId
}: UseTerminalPaneContextMenuDeps): TerminalMenuState {
  const pastePane = (pane: ManagedPane, source: 'context-menu' | 'right-click'): Promise<void> =>
    pasteFromTerminalContextMenu({
      forceBracketedMultilineTextPaste,
      managerRef,
      onPasteError,
      pane,
      paneTransportsRef,
      source,
      tabId,
      worktreeId
    })
  const onRightClickPaste = (pane: ManagedPane): void => void pastePane(pane, 'right-click')
  const target = useTerminalContextMenuTarget({
    managerRef,
    onRightClickPaste,
    rightClickToPaste
  })
  const { clearMenuPaneTarget, resolveMenuPane } = target

  const onCopy = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    const selection = pane.terminal.getSelection()
    if (selection) {
      await shellClient.ui.writeClipboardText(selection)
    }
    pane.terminal.focus()
  }
  const onCopyPaneId = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    await shellClient.ui.writeClipboardText(makePaneKey(tabId, pane.leafId))
    toast.success(
      translate(
        'auto.components.terminal.pane.use.terminal.pane.context.menu.a29b9faa01',
        'Pane ID copied'
      )
    )
    pane.terminal.focus()
  }
  const onCopyTerminalId = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    try {
      await copyTerminalHandleForPane({
        tabId,
        leafId: pane.leafId,
        writeClipboardText: shellClient.ui.writeClipboardText
      })
      toast.success(
        translate(
          'auto.components.terminal.pane.use.terminal.pane.context.menu.terminal.id.copied',
          'Terminal ID copied'
        )
      )
    } catch {
      toast.error(
        translate(
          'auto.components.terminal.pane.use.terminal.pane.context.menu.terminal.id.copy.failed',
          'Unable to copy terminal ID'
        )
      )
    } finally {
      pane.terminal.focus()
    }
  }
  const onPaste = async (): Promise<void> => {
    const pane = resolveMenuPane()
    if (pane) {
      await pastePane(pane, 'context-menu')
    }
  }

  const splitWithInheritedCwd = useEventCallback(
    (
      direction: 'vertical' | 'horizontal',
      source: 'contextual_tour' | 'context_menu' = 'context_menu'
    ): void => {
      const pane = resolveMenuPane()
      const manager = managerRef.current
      if (pane && manager) {
        splitTerminalPaneWithInheritedCwd({
          manager,
          getManager: () => managerRef.current,
          paneTransports: paneTransportsRef.current,
          paneCwdMap: paneCwdRef.current,
          fallbackCwd,
          pane,
          direction,
          source
        })
      }
    }
  )
  useEffect(() => {
    const onRequestSplit = (event: Event): void => {
      const detail = (event as CustomEvent<RequestActiveTerminalPaneSplitDetail>).detail
      if (!detail?.tabId || detail.tabId === tabId) {
        clearMenuPaneTarget()
        splitWithInheritedCwd(detail?.direction ?? 'vertical', getRequestedSplitTelemetrySource())
      }
    }
    window.addEventListener(REQUEST_ACTIVE_TERMINAL_PANE_SPLIT_EVENT, onRequestSplit)
    return () =>
      window.removeEventListener(REQUEST_ACTIVE_TERMINAL_PANE_SPLIT_EVENT, onRequestSplit)
  }, [clearMenuPaneTarget, splitWithInheritedCwd, tabId])

  const withPane = (action: (pane: ManagedPane) => void): void => {
    const pane = resolveMenuPane()
    if (pane) {
      action(pane)
    }
  }
  const agentActions = useTerminalContextMenuAgentActions({
    fallbackCwd,
    groupId,
    onAgentSessionContinuationReady,
    onAgentSessionForkReady,
    paneCwdRef,
    paneTransportsRef,
    resolveMenuPane,
    tabId,
    worktreeId
  })

  return {
    ...target,
    ...agentActions,
    onCopy,
    onCopyPaneId,
    onCopyTerminalId,
    onPaste,
    onSplitRight: () => splitWithInheritedCwd('vertical'),
    onSplitDown: () => splitWithInheritedCwd('horizontal'),
    onEqualizePaneSizes: () =>
      withPane((pane) => {
        managerRef.current?.equalizePaneSizes()
        pane.terminal.focus()
      }),
    onClosePane: () =>
      withPane((pane) => {
        if ((managerRef.current?.getPanes().length ?? 0) > 1) {
          onRequestClosePane(pane.id)
        }
      }),
    onClearScreen: () => withPane(onClearPaneScrollback),
    onToggleExpand: () => withPane((pane) => toggleExpandPane(pane.id)),
    onSetTitle: () => withPane((pane) => onSetTitle(pane.id)),
    onClearPaneTitle: () => withPane((pane) => onClearPaneTitle(pane.id))
  }
}

function getRequestedSplitTelemetrySource(): 'contextual_tour' | 'context_menu' {
  return useAppStore.getState().activeContextualTourId === 'workspace-agent-sessions'
    ? 'contextual_tour'
    : 'context_menu'
}
