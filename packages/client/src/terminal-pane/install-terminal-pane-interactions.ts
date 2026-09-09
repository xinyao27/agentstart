import type { IDisposable } from '@xterm/xterm'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

import { isPrimarySelectionEnabled, setPrimarySelectionText } from '../clipboard/primary-selection'
import { shellClient } from '../runtime/shell-client'
import { installMouseHideWhileTyping } from './mouse-hide-while-typing'
import type { PaneManager } from './pane-manager/pane-manager'
import type { ManagedPane } from './pane-manager/types'
import type { SessionRestoredBannerStartup } from './session-restored-banner-pane-state'
import { seedStartupSessionRestoredBanner } from './session-restored-banner-pane-state'
import { createTerminalHandleLinkProvider } from './terminal-handle-links'
import {
  createFilePathLinkProvider,
  installFilePathLinkClickFallback,
  type LinkHandlerDeps
} from './terminal-link-handlers'
import { handleOscLink } from './terminal-osc-link-routing'
import { formatTerminalUrlTooltip } from './terminal-pane-link-metadata'
import { terminalSelectionExceedsPrimaryLimit } from './terminal-primary-selection'
import { installHttpLinkClickFallback } from './terminal-url-link-hit-testing'

type InstallTerminalPaneInteractionsInput = {
  fileLinkClickFallbackDisposables: Map<number, IDisposable>
  fileOpenLinkHint: string
  getPaneLinkCwd: (paneId: number) => string
  httpLinkClickFallbackDisposables: Map<number, IDisposable>
  linkDeps: LinkHandlerDeps
  linkProviderDisposables: Map<number, IDisposable>
  managerRef: React.RefObject<PaneManager | null>
  mouseHideDisposables: Map<number, IDisposable>
  onShowSessionRestoredBanner: (paneId: number) => void
  pane: ManagedPane
  selectionCaptureTimers: Map<number, number>
  selectionDisposables: Map<number, IDisposable>
  settingsRef: React.RefObject<GlobalSettings | null | undefined>
  startup: SessionRestoredBannerStartup
  terminalHandleLinkDisposables: Map<number, IDisposable>
  urlOpenLinkHint: string
}

export function installTerminalPaneInteractions({
  fileLinkClickFallbackDisposables,
  fileOpenLinkHint,
  getPaneLinkCwd,
  httpLinkClickFallbackDisposables,
  linkDeps,
  linkProviderDisposables,
  managerRef,
  mouseHideDisposables,
  onShowSessionRestoredBanner,
  pane,
  selectionCaptureTimers,
  selectionDisposables,
  settingsRef,
  startup,
  terminalHandleLinkDisposables,
  urlOpenLinkHint
}: InstallTerminalPaneInteractionsInput): void {
  linkProviderDisposables.set(
    pane.id,
    pane.terminal.registerLinkProvider(
      createFilePathLinkProvider(pane.id, linkDeps, pane.linkTooltip, fileOpenLinkHint)
    )
  )
  terminalHandleLinkDisposables.set(
    pane.id,
    pane.terminal.registerLinkProvider(
      createTerminalHandleLinkProvider({
        getTerminal: () =>
          managerRef.current?.getPanes().find((candidate) => candidate.id === pane.id)?.terminal ??
          null,
        getRuntimeEnvironmentId: () => linkDeps.getRuntimeEnvironmentIdForPane?.(pane.id) ?? null,
        linkTooltip: pane.linkTooltip
      })
    )
  )
  fileLinkClickFallbackDisposables.set(
    pane.id,
    installFilePathLinkClickFallback(pane.id, pane.terminal, linkDeps)
  )
  httpLinkClickFallbackDisposables.set(
    pane.id,
    installHttpLinkClickFallback(pane.terminal, {
      worktreeId: linkDeps.worktreeId,
      getRuntimeEnvironmentId: () => linkDeps.getRuntimeEnvironmentIdForPane?.(pane.id) ?? null
    })
  )
  seedStartupSessionRestoredBanner(startup, pane.id, onShowSessionRestoredBanner)
  selectionDisposables.set(
    pane.id,
    pane.terminal.onSelectionChange(() => {
      captureTerminalSelection(pane, settingsRef, selectionCaptureTimers)
    })
  )
  if (settingsRef.current?.terminalMouseHideWhileTyping) {
    mouseHideDisposables.set(pane.id, installMouseHideWhileTyping(pane.terminal, pane.container))
  }

  let tooltipHoverToken = 0
  pane.terminal.options.linkHandler = {
    allowNonHttpProtocols: true,
    activate: (event, text) => {
      const handled = handleOscLink(text, event as MouseEvent | undefined, {
        ...linkDeps,
        startupCwd: getPaneLinkCwd(pane.id),
        runtimeEnvironmentId: linkDeps.getRuntimeEnvironmentIdForPane?.(pane.id) ?? null
      })
      if (handled) {
        pane.terminal.clearSelection()
      }
    },
    hover: (_event, text) => {
      tooltipHoverToken += 1
      const hoverToken = tooltipHoverToken
      pane.linkTooltip.textContent = `${text} (${urlOpenLinkHint})`
      pane.linkTooltip.style.display = ''
      void formatTerminalUrlTooltip(text, urlOpenLinkHint).then((nextText) => {
        if (hoverToken === tooltipHoverToken && nextText) {
          pane.linkTooltip.textContent = nextText
        }
      })
    },
    leave: () => {
      tooltipHoverToken += 1
      pane.linkTooltip.style.display = 'none'
    }
  }
}

function captureTerminalSelection(
  pane: ManagedPane,
  settingsRef: React.RefObject<GlobalSettings | null | undefined>,
  selectionCaptureTimers: Map<number, number>
): void {
  const shouldWritePrimarySelection = isPrimarySelectionEnabled()
  const shouldWriteClipboard = settingsRef.current?.terminalClipboardOnSelect === true
  if ((!shouldWritePrimarySelection && !shouldWriteClipboard) || !pane.terminal.hasSelection()) {
    return
  }
  if (
    shouldWritePrimarySelection &&
    !shouldWriteClipboard &&
    terminalSelectionExceedsPrimaryLimit(pane.terminal)
  ) {
    return
  }
  if (shouldWritePrimarySelection) {
    const existingTimer = selectionCaptureTimers.get(pane.id)
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer)
    }
    const timer = window.setTimeout(() => {
      selectionCaptureTimers.delete(pane.id)
      if (
        isPrimarySelectionEnabled() &&
        pane.terminal.hasSelection() &&
        !terminalSelectionExceedsPrimaryLimit(pane.terminal)
      ) {
        const selection = pane.terminal.getSelection()
        if (selection) {
          setPrimarySelectionText(selection)
        }
      }
    }, 100)
    selectionCaptureTimers.set(pane.id, timer)
  }
  if (shouldWriteClipboard) {
    const selection = pane.terminal.getSelection()
    if (selection) {
      void shellClient.ui.writeClipboardText(selection).catch(() => {})
    }
  }
}
