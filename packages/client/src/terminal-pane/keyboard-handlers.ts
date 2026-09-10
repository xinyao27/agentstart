import type { KeybindingPlatform } from '@agentstart/protocol/keybindings'
import { makePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import { useEffect } from 'react'
import { normalizeSelectedTextForFileSearch } from '~renderer/editor/file-search-selection'
import {
  getLayoutBaseCharacterForCode,
  prefetchLayoutBaseCharacters
} from '~renderer/keyboard-layout/layout-base-character'
import { useAppStore } from '~renderer/store/state'
import type { ManagedPane } from '~renderer/terminal-pane/pane-manager/pane-manager'

import { isLocalWindowsConptyPaneForCtrlArrow } from './terminal-ctrl-arrow-conpty'
import { resolveTerminalInputHostPlatform } from './terminal-input-host-platform'
import { handleTerminalKeyboardAction } from './terminal-keyboard-action'
import {
  isEditableTerminalKeyboardTarget,
  matchFileSearchShortcut,
  matchSearchNavigate,
  runTerminalSearchNavigation
} from './terminal-keyboard-search'
export { type SearchState } from './terminal-keyboard-search'
import { keyboardEventBelongsToScope } from './terminal-keyboard-scope'
import type { KeyboardHandlersDeps } from './terminal-keyboard-types'
import { resolveTerminalShortcutAction } from './terminal-shortcut-policy'
import { resolveWindowsShiftEnterEncodingForPane } from './terminal-windows-shift-enter'

function resolveTerminalKeyboardShortcutAction(
  event: Parameters<typeof resolveTerminalShortcutAction>[0],
  isMac: Parameters<typeof resolveTerminalShortcutAction>[1],
  macOptionAsAlt: Parameters<typeof resolveTerminalShortcutAction>[2],
  optionKeyLocation: Parameters<typeof resolveTerminalShortcutAction>[3],
  isWindows: Parameters<typeof resolveTerminalShortcutAction>[4],
  keybindings: Parameters<typeof resolveTerminalShortcutAction>[5],
  isLocalWindowsConptyPane: Parameters<typeof resolveTerminalShortcutAction>[6],
  isKittyKeyboardActivePane: Parameters<typeof resolveTerminalShortcutAction>[7],
  layoutBaseCharacterForCode: Parameters<typeof resolveTerminalShortcutAction>[8],
  getWindowsShiftEnterEncoding: Parameters<typeof resolveTerminalShortcutAction>[9],
  isWindowsTerminalHost: NonNullable<Parameters<typeof resolveTerminalShortcutAction>[10]>
): ReturnType<typeof resolveTerminalShortcutAction> {
  return resolveTerminalShortcutAction(
    event,
    isMac,
    macOptionAsAlt,
    optionKeyLocation,
    isWindows,
    keybindings,
    isLocalWindowsConptyPane,
    isKittyKeyboardActivePane,
    layoutBaseCharacterForCode,
    getWindowsShiftEnterEncoding,
    isWindowsTerminalHost
  )
}

export function useTerminalKeyboardShortcuts({
  terminalShortcutPolicy = 'agentstart-first',
  ...deps
}: KeyboardHandlersDeps): void {
  const {
    expandedPaneIdRef,
    fallbackCwd,
    isActive,
    keybindings,
    keyboardScopeRef,
    macOptionAsAltRef,
    managerRef,
    onClearPaneScrollback,
    onClearPaneTitle,
    onRequestClosePane,
    onSearchSelectedText,
    onSetTitle,
    paneCwdRef,
    paneKittyKeyboardModesRef,
    panePtyBindingsRef,
    paneTransportsRef,
    persistLayoutSnapshot,
    refreshPaneSizes,
    restoreExpandedLayout,
    searchOpenRef,
    searchStateRef,
    setExpandedPane,
    setSearchOpen,
    tabId,
    toggleExpandPane,
    worktreeId
  } = deps
  useEffect(() => {
    if (!isActive) {
      return
    }
    const isMac = navigator.userAgent.includes('Mac')
    const isWindows = navigator.userAgent.includes('Windows')
    const shortcutPlatform: KeybindingPlatform = isMac ? 'darwin' : isWindows ? 'win32' : 'linux'
    if (isMac) {
      prefetchLayoutBaseCharacters()
    }
    let optionKeyLocation = 0
    const onModifierDown = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') {
        optionKeyLocation = event.location
      }
    }
    const onModifierUp = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') {
        optionKeyLocation = 0
      }
    }
    const activePane = (): ManagedPane | undefined => {
      const manager = managerRef.current
      return manager?.getActivePane() ?? manager?.getPanes()[0]
    }
    const getWindowsShiftEnterEncoding = () => {
      const pane = activePane()
      return pane
        ? resolveWindowsShiftEnterEncodingForPane(
            useAppStore.getState(),
            makePaneKey(tabId, pane.leafId)
          )
        : ('alt-enter' as const)
    }
    const isWindowsTerminalHost = (): boolean => {
      const pane = activePane()
      return (
        resolveTerminalInputHostPlatform({
          clientPlatform: shortcutPlatform,
          state: useAppStore.getState(),
          worktreeId: worktreeId,
          transport: pane ? (paneTransportsRef.current.get(pane.id) ?? null) : null
        }) === 'win32'
      )
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const manager = managerRef.current
      if (!manager) {
        return
      }
      const keyboardScope = keyboardScopeRef.current
      if (keyboardScope && !keyboardEventBelongsToScope(event, keyboardScope)) {
        return
      }
      if (matchFileSearchShortcut(event, shortcutPlatform, keybindings, terminalShortcutPolicy)) {
        const selectedText = normalizeSelectedTextForFileSearch(
          activePane()?.terminal.getSelection()
        )
        if (selectedText) {
          event.preventDefault()
          event.stopImmediatePropagation()
          onSearchSelectedText(selectedText)
          return
        }
      }
      const direction = matchSearchNavigate(
        event,
        isMac,
        searchOpenRef.current,
        searchStateRef.current
      )
      if (direction !== null) {
        if (event.repeat) {
          return
        }
        event.preventDefault()
        event.stopImmediatePropagation()
        const pane = activePane()
        if (pane) {
          runTerminalSearchNavigation(pane, direction, searchStateRef.current)
          pane.terminal.focus()
        }
        return
      }
      if (isEditableTerminalKeyboardTarget(event.target)) {
        return
      }
      const isLocalWindowsConptyPane = (): boolean => {
        const pane = activePane()
        return pane
          ? isLocalWindowsConptyPaneForCtrlArrow({
              isWindows,
              userAgent: navigator.userAgent,
              state: useAppStore.getState(),
              worktreeId: worktreeId,
              tabId: tabId,
              paneId: pane.id,
              paneCwd: paneCwdRef.current,
              fallbackCwd: fallbackCwd,
              transport: paneTransportsRef.current.get(pane.id) ?? null
            })
          : false
      }
      const isKittyKeyboardActivePane = (): boolean => {
        const pane = activePane()
        return pane ? (paneKittyKeyboardModesRef?.current.get(pane.id)?.flags ?? 0) > 0 : false
      }
      const action = resolveTerminalKeyboardShortcutAction(
        event,
        isMac,
        macOptionAsAltRef.current,
        optionKeyLocation,
        isWindows,
        keybindings,
        isLocalWindowsConptyPane,
        isKittyKeyboardActivePane,
        getLayoutBaseCharacterForCode,
        getWindowsShiftEnterEncoding,
        isWindowsTerminalHost
      )
      if (action) {
        handleTerminalKeyboardAction({
          action,
          event,
          expandedPaneIdRef,
          fallbackCwd,
          manager,
          managerRef,
          onClearPaneScrollback,
          onClearPaneTitle,
          onRequestClosePane,
          onSetTitle,
          paneCwdRef,
          panePtyBindingsRef,
          paneTransportsRef,
          persistLayoutSnapshot,
          refreshPaneSizes,
          restoreExpandedLayout,
          setExpandedPane,
          setSearchOpen,
          tabId,
          toggleExpandPane
        })
      }
    }

    window.addEventListener('keydown', onModifierDown, { capture: true })
    window.addEventListener('keyup', onModifierUp, { capture: true })
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onModifierDown, { capture: true })
      window.removeEventListener('keyup', onModifierUp, { capture: true })
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [
    expandedPaneIdRef,
    fallbackCwd,
    isActive,
    keybindings,
    keyboardScopeRef,
    macOptionAsAltRef,
    managerRef,
    onClearPaneScrollback,
    onClearPaneTitle,
    onRequestClosePane,
    onSearchSelectedText,
    onSetTitle,
    paneCwdRef,
    paneKittyKeyboardModesRef,
    panePtyBindingsRef,
    paneTransportsRef,
    persistLayoutSnapshot,
    refreshPaneSizes,
    restoreExpandedLayout,
    searchOpenRef,
    searchStateRef,
    setExpandedPane,
    setSearchOpen,
    tabId,
    toggleExpandPane,
    worktreeId,
    terminalShortcutPolicy
  ])
}
