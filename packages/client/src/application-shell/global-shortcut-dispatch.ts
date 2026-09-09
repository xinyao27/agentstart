import {
  keybindingMatchesAction,
  type KeybindingActionId,
  type KeybindingContext,
  type PhysicalModifierToken
} from '@yiru/protocol/keybindings'

import { getSelectedTextForFileSearch } from '../editor/file-search-selection'
import { isEditableTarget } from '../keyboard-input/editable-target'
import { getRendererAppPlatform } from '../settings/renderer-app-platform'
import { requestScrollToCurrentWorkspaceRevealAndRename } from '../sidebar/scroll-to-current-workspace-status'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'
import { showTerminalShortcutCaptureNotification } from '../terminal-workspace/terminal-shortcut-capture-notification'
import {
  folderRelativePathToIncludeGlob,
  selectedExplorerFolderRelativePath
} from '../workspace-panel/file-explorer/file-search-include-pattern'
import { showWorkspaceSidebar, toggleWorkspaceSidebar } from '../workspace-panel/show-sidebar'
import { shouldShowWorktreeHistoryControls } from './titlebar-worktree-history-controls'

const shortcutPlatform = getRendererAppPlatform()

export type ShortcutDispatchInput = {
  key?: string
  code?: string
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  doubleTapModifier?: PhysicalModifierToken
  target: EventTarget | null
  defaultPrevented: boolean
  preventDefault: () => void
}

export type GlobalShortcutState = Pick<
  AppState,
  'activeView' | 'activeWorktreeId' | 'keybindings'
> & {
  creationLayoutActive: boolean
  terminalShortcutPolicy: NonNullable<AppState['settings']>['terminalShortcutPolicy'] | undefined
  workspaceChromeActive: boolean
}

function getKeybindingContext(target: EventTarget | null): KeybindingContext {
  return target instanceof HTMLElement && target.classList.contains('xterm-helper-textarea')
    ? 'terminal'
    : 'app'
}

export function dispatchGlobalShortcut(
  input: ShortcutDispatchInput,
  state: GlobalShortcutState
): void {
  if (input.defaultPrevented) {
    return
  }
  if (
    input.target instanceof Element &&
    input.target.closest('[data-shortcut-recorder-active]') !== null
  ) {
    return
  }

  const context = getKeybindingContext(input.target)
  const matchShortcut = (actionId: KeybindingActionId): boolean =>
    keybindingMatchesAction(actionId, input, shortcutPlatform, state.keybindings, {
      context,
      terminalShortcutPolicy: state.terminalShortcutPolicy
    })
  const notifyTerminalCapture = (actionId: KeybindingActionId): void => {
    if (context === 'terminal' && (state.terminalShortcutPolicy ?? 'yiru-first') === 'yiru-first') {
      showTerminalShortcutCaptureNotification({
        actionId,
        platform: shortcutPlatform,
        keybindings: state.keybindings
      })
    }
  }
  const canOpenWorkspaceSidebar =
    !state.creationLayoutActive &&
    state.activeView === 'terminal' &&
    state.activeWorktreeId !== null &&
    state.workspaceChromeActive
  const toggleSearchSidebar = (query: string | null): void => {
    toggleWorkspaceSidebar({
      view: 'explorer',
      explorerDestination: { view: 'search', ...(query ? { query } : {}) }
    })
  }

  if (matchShortcut('sourceControl.sendReviewNotes') && canOpenWorkspaceSidebar) {
    if (useAppStore.getState().openDiffNotesSendMenuForActiveWorktree()) {
      input.preventDefault()
      notifyTerminalCapture('sourceControl.sendReviewNotes')
      showWorkspaceSidebar({ view: 'source-control' })
      return
    }
  }

  if (matchShortcut('sidebar.search.toggle') && canOpenWorkspaceSidebar) {
    const selectedFolderRelativePath =
      document.activeElement instanceof Element
        ? selectedExplorerFolderRelativePath(document.activeElement)
        : null
    if (selectedFolderRelativePath !== null && state.activeWorktreeId) {
      input.preventDefault()
      notifyTerminalCapture('sidebar.search.toggle')
      toggleWorkspaceSidebar({
        view: 'explorer',
        explorerDestination: {
          view: 'search',
          includePattern: folderRelativePathToIncludeGlob(selectedFolderRelativePath)
        }
      })
      return
    }
    const selectedText = getSelectedTextForFileSearch()
    if (selectedText) {
      input.preventDefault()
      notifyTerminalCapture('sidebar.search.toggle')
      toggleSearchSidebar(selectedText)
      return
    }
  }

  if (isEditableTarget(input.target)) {
    return
  }
  if (matchShortcut('worktree.history.back') || matchShortcut('worktree.history.forward')) {
    if (state.creationLayoutActive || !shouldShowWorktreeHistoryControls(state.activeView)) {
      return
    }
    input.preventDefault()
    const store = useAppStore.getState()
    if (matchShortcut('worktree.history.back')) {
      store.goBackWorktree()
    } else {
      store.goForwardWorktree()
    }
    return
  }
  if (matchShortcut('sidebar.left.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.left.toggle')
    useAppStore.getState().toggleSidebar()
    return
  }
  if (matchShortcut('sidebar.sleepingWorkspaces.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.sleepingWorkspaces.toggle')
    const store = useAppStore.getState()
    const nextShowSleeping = !store.showSleepingWorkspaces
    store.setShowSleepingWorkspaces(nextShowSleeping)
    if (nextShowSleeping) {
      store.setSidebarOpen(true)
    }
    return
  }
  if (state.workspaceChromeActive && matchShortcut('tab.rename')) {
    const store = useAppStore.getState()
    if (store.activeTabType === 'terminal' && store.activeTabId) {
      input.preventDefault()
      notifyTerminalCapture('tab.rename')
      store.setRenamingTabId(store.activeTabId)
      return
    }
  }
  if (state.workspaceChromeActive && matchShortcut('workspace.rename') && state.activeWorktreeId) {
    input.preventDefault()
    notifyTerminalCapture('workspace.rename')
    useAppStore.getState().setSidebarOpen(true)
    requestScrollToCurrentWorkspaceRevealAndRename()
    return
  }
  if (!canOpenWorkspaceSidebar) {
    return
  }
  if (matchShortcut('sidebar.right.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.right.toggle')
    const store = useAppStore.getState()
    store.setRightSidebarOpen(!store.rightSidebarOpen)
    return
  }
  if (matchShortcut('sidebar.explorer.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.explorer.toggle')
    toggleWorkspaceSidebar({ view: 'explorer', explorerDestination: { view: 'files' } })
    return
  }
  if (matchShortcut('sidebar.search.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.search.toggle')
    toggleSearchSidebar(null)
    return
  }
  if (matchShortcut('sidebar.sourceControl.toggle')) {
    if (document.querySelector('[data-terminal-search-root]')) {
      return
    }
    input.preventDefault()
    notifyTerminalCapture('sidebar.sourceControl.toggle')
    toggleWorkspaceSidebar({ view: 'source-control' })
    return
  }
  if (matchShortcut('sidebar.checks.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.checks.toggle')
    toggleWorkspaceSidebar({ view: 'source-control', sourceControlView: 'review' })
    return
  }
  if (matchShortcut('sidebar.ports.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.ports.toggle')
    toggleWorkspaceSidebar({ view: 'ports' })
  }
}
