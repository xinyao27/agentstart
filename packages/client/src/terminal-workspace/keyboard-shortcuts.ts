import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { keybindingMatchesAction, type KeybindingActionId } from '@agentstart/protocol/keybindings'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { showTerminalShortcutCaptureNotification } from '~renderer/terminal-workspace/terminal-shortcut-capture-notification'
import { matchesRecentTabSwitcherChord } from '~renderer/window-shortcut-policy'

import { requestEditorCmdSave } from '../editor/autosave'
import {
  handleSwitchRecentTab,
  handleSwitchTab,
  handleSwitchTabAcrossAllTypes,
  handleSwitchTerminalTab
} from '../tab-bar/ipc-tab-switch'
import { resolveAgentLaunchShortcut } from './agent-launch-shortcut'
import { getKeybindingContext } from './tab-model-lookup'

type TerminalWorkspaceKeyboardShortcutsArgs = {
  handleNewTab: (shellOverride?: string) => void
  handleNewAgentTab: (agent: TuiAgent) => void
  handleNewSimulatorTab: () => void
  handleNewBrowserTab: () => void
  handleNewFile: () => Promise<void>
  handleCloseFile: (fileId: string) => void
  handleCloseBrowserTab: (tabId: string) => void
  handleCloseAllFiles: () => void
}

export function useTerminalWorkspaceKeyboardShortcuts({
  handleNewTab,
  handleNewAgentTab,
  handleNewSimulatorTab,
  handleNewBrowserTab,
  handleNewFile,
  handleCloseFile,
  handleCloseBrowserTab,
  handleCloseAllFiles
}: TerminalWorkspaceKeyboardShortcutsArgs): void {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const keybindings = useAppStore((s) => s.keybindings)
  const terminalShortcutPolicy = useAppStore(
    (s) => s.settings?.terminalShortcutPolicy ?? 'agentstart-first'
  )
  const mobileEmulatorEnabled = useAppStore((s) => s.settings?.mobileEmulatorEnabled !== false)

  useEffect(() => {
    if (!activeWorktreeId) {
      return
    }

    const isMac = navigator.userAgent.includes('Mac')
    const shortcutPlatform: NodeJS.Platform = isMac
      ? 'darwin'
      : navigator.userAgent.includes('Windows')
        ? 'win32'
        : 'linux'
    const onKeyDown = (e: KeyboardEvent): void => {
      const context = getKeybindingContext(e.target)
      const matchShortcut = (actionId: KeybindingActionId): boolean =>
        keybindingMatchesAction(actionId, e, shortcutPlatform, keybindings, {
          context,
          terminalShortcutPolicy
        })
      const notifyTerminalCapture = (actionId: KeybindingActionId): void => {
        if (context !== 'terminal' || terminalShortcutPolicy !== 'agentstart-first') {
          return
        }
        showTerminalShortcutCaptureNotification({
          actionId,
          platform: shortcutPlatform,
          keybindings
        })
      }
      // Why: Cmd/Ctrl+T always opens a new terminal, regardless of which
      // surface is active. Browser-tab creation has its own shortcut
      // (Cmd/Ctrl+Shift+B) so users have a predictable way to spawn a
      // terminal from anywhere in the central pane.
      if (!e.repeat && matchShortcut('tab.newTerminal')) {
        e.preventDefault()
        notifyTerminalCapture('tab.newTerminal')
        handleNewTab()
        return
      }

      // Cmd/Ctrl+Alt+T (macOS default) — launch the default agent in a new
      // tab; per-agent chords (Settings → Shortcuts → Agents) launch their
      // specific agent. Unlike Cmd+T this never targets the floating panel:
      // agent sessions belong to a worktree, so the launch always lands in
      // the active workspace's tab bar.
      if (!e.repeat) {
        const match = resolveAgentLaunchShortcut(activeWorktreeId, matchShortcut)
        if (match) {
          e.preventDefault()
          notifyTerminalCapture(match.agentActionId)
          if (match.agentToLaunch) {
            handleNewAgentTab(match.agentToLaunch)
          } else {
            toast.message(
              translate(
                'auto.components.Terminal.5b2c1a9e44',
                'No agent CLI detected — install one or pick a default agent in Settings.'
              )
            )
          }
          return
        }
      }

      // Cmd/Ctrl+Shift+T — reopen the most recently closed tab of any kind
      // (terminal, browser, or editor), Chrome/Ghostty-style. Repeated presses
      // walk back through the close history.
      if (!e.repeat && matchShortcut('tab.reopenClosed')) {
        e.preventDefault()
        notifyTerminalCapture('tab.reopenClosed')
        useAppStore.getState().reopenClosedTab(activeWorktreeId)
        return
      }

      // Cmd/Ctrl+Shift+B - new browser tab
      if (!e.repeat && matchShortcut('tab.newBrowser')) {
        e.preventDefault()
        notifyTerminalCapture('tab.newBrowser')
        handleNewBrowserTab()
        return
      }

      // Cmd/Ctrl+Shift+E — new mobile emulator tab (macOS only)
      if (!e.repeat && mobileEmulatorEnabled && matchShortcut('tab.newSimulator')) {
        e.preventDefault()
        notifyTerminalCapture('tab.newSimulator')
        handleNewSimulatorTab()
        return
      }

      // Save the editor panel that owns the event target. The explicit panel
      // identity keeps split and floating editors from saving a different tab.
      if (!e.repeat && matchShortcut('editor.save')) {
        const state = useAppStore.getState()
        const activeUnifiedTab = state.activeWorktreeId
          ? state.getActiveTab(state.activeWorktreeId)
          : null
        const target = e.target instanceof HTMLElement ? e.target : null
        const targetPanel = target?.closest<HTMLElement>('[data-editor-panel-file-id]') ?? null
        const targetFileId = targetPanel?.dataset.editorPanelFileId
        const targetViewStateId = targetPanel?.dataset.editorPanelViewStateId
        const saveOwnerFileId = target?.closest<HTMLElement>('[data-editor-save-file-id]')?.dataset
          .editorSaveFileId
        const fallbackFileId =
          state.activeTabType === 'editor' &&
          state.activeFileId &&
          (!activeUnifiedTab || activeUnifiedTab.contentType !== 'git-graph')
            ? state.activeFileId
            : null
        const fileId = targetFileId ?? fallbackFileId
        if (fileId) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          notifyTerminalCapture('editor.save')
          requestEditorCmdSave({
            panelFileId: fileId,
            fileId: saveOwnerFileId ?? fileId,
            viewStateId: targetViewStateId
          })
          return
        }
      }

      // Cmd/Ctrl+Shift+M - new markdown file
      if (!e.repeat && matchShortcut('tab.newMarkdown')) {
        e.preventDefault()
        notifyTerminalCapture('tab.newMarkdown')
        void handleNewFile()
        return
      }

      // Cmd/Ctrl+W - close active editor tab, browser tab, or terminal pane.
      // Terminal pane/tab close is handled by the pane-level keyboard handler
      // in keyboard-handlers.ts so it can close individual split panes and
      // show a confirmation dialog. We still preventDefault here so the browser
      // doesn't close the window as its default Cmd+W action.
      if (!e.repeat && matchShortcut('tab.close')) {
        const state = useAppStore.getState()
        if (state.activeTabType === 'terminal' && context === 'terminal') {
          return
        }
        e.preventDefault()
        notifyTerminalCapture('tab.close')
        const activeUnifiedTab = state.activeWorktreeId
          ? state.getActiveTab(state.activeWorktreeId)
          : null
        if (activeUnifiedTab && activeUnifiedTab.contentType === 'git-graph') {
          state.closeUnifiedTab(activeUnifiedTab.id)
        } else if (state.activeTabType === 'editor' && state.activeFileId) {
          handleCloseFile(state.activeFileId)
        } else if (state.activeTabType === 'browser' && state.activeBrowserTabId) {
          handleCloseBrowserTab(state.activeBrowserTabId)
        }
        return
      }

      // Cmd/Ctrl+Alt+W - close every editor file tab in the active worktree.
      // Why: reuse the context-menu close-all path so pinned and dirty-file
      // rules stay identical; terminal focus still honors shortcut policy.
      if (!e.repeat && matchShortcut('tab.closeAll')) {
        e.preventDefault()
        notifyTerminalCapture('tab.closeAll')
        handleCloseAllFiles()
        return
      }

      // Ctrl+Tab - quick-toggle to the previously focused tab in this group.
      if (
        matchesRecentTabSwitcherChord(e, shortcutPlatform, keybindings, {
          context,
          terminalShortcutPolicy
        })
      ) {
        return
      }
      if (!e.repeat && matchShortcut('tab.previousRecent')) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        handleSwitchRecentTab()
        return
      }

      // Cmd/Ctrl+Shift+] and Cmd/Ctrl+Shift+[ - switch tabs (scoped to the
      // active tab type). Cmd/Ctrl+Alt+] and Cmd/Ctrl+Alt+[ cycles across
      // every tab type as an escape hatch from the type-scoped default, and
      // matches the platform tab-switch chord on macOS.
      // Why: use e.code instead of e.key because on macOS, Shift+[ reports '{'
      // as the key value (the shifted character), not '['. Option+[ also
      // composes to dead-key / punctuation on many layouts, so matching on
      // event.key would miss the chord entirely on non-US layouts.
      const switchSameTypeDirection = matchShortcut('tab.nextSameType')
        ? 1
        : matchShortcut('tab.previousSameType')
          ? -1
          : null
      const switchAllTypesDirection = matchShortcut('tab.nextAllTypes')
        ? 1
        : matchShortcut('tab.previousAllTypes')
          ? -1
          : null
      if (!e.repeat && (switchSameTypeDirection !== null || switchAllTypesDirection !== null)) {
        // Why: delegate to the shared handler used by the IPC shortcut path
        // so both code paths share one implementation. Always consume the
        // chord — even when the switch is a no-op (e.g. single tab), we own
        // this key combo and shouldn't let it reach xterm or the browser
        // guest's default handling.
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        notifyTerminalCapture(
          switchAllTypesDirection !== null
            ? switchAllTypesDirection === 1
              ? 'tab.nextAllTypes'
              : 'tab.previousAllTypes'
            : switchSameTypeDirection === 1
              ? 'tab.nextSameType'
              : 'tab.previousSameType'
        )
        if (switchAllTypesDirection !== null) {
          handleSwitchTabAcrossAllTypes(switchAllTypesDirection)
        } else {
          handleSwitchTab(switchSameTypeDirection ?? 1)
        }
      }

      // Ctrl+PageDown/PageUp - switch terminal tabs only
      // Why: this chord intentionally uses Ctrl on every platform; on macOS,
      // Cmd+PageUp/PageDown is an OS desktop-switch shortcut we should not steal.
      // Why: also reject Shift so Ctrl+Shift+PageUp/PageDown stays available
      // for focused terminal / editor consumers and matches the unshifted
      // predicate in browser-guest-ui.ts and the chord advertised in
      // ShortcutsPane.
      const terminalTabDirection = matchShortcut('tab.nextTerminal')
        ? 1
        : matchShortcut('tab.previousTerminal')
          ? -1
          : null
      if (!e.repeat && terminalTabDirection !== null) {
        // Why: always consume the chord before xterm's textarea listener
        // sees it, regardless of whether we actually switched tabs. xterm
        // translates plain Ctrl+PageUp/PageDown into \e[5~ / \e[6~ escape
        // sequences and writes them to the shell; that stray output then
        // also flips the tab's unread/bell indicator. In the single-terminal
        // case handleSwitchTerminalTab is a no-op, but we still need to
        // swallow the event — otherwise pressing the chord on the only
        // terminal leaves "5~" in the shell and lights up a phantom
        // notification on the tab that already has focus. preventDefault
        // alone does not stop xterm's own keydown listener, so we also
        // stop propagation.
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        handleSwitchTerminalTab(terminalTabDirection)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [
    activeWorktreeId,
    handleNewBrowserTab,
    handleNewSimulatorTab,
    handleNewFile,
    handleNewTab,
    handleNewAgentTab,
    handleCloseFile,
    handleCloseBrowserTab,
    handleCloseAllFiles,
    keybindings,
    mobileEmulatorEnabled,
    terminalShortcutPolicy
  ])
}
