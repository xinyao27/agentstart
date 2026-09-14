import {
  keybindingMatchesAction,
  matchKeybindingDigitIndex,
  type KeybindingActionId,
  type KeybindingContext,
  type PhysicalModifierToken
} from '@agentstart/protocol/keybindings'

import { openWorkspaceCreationComposerWithTourHandoff } from '../contextual-tours/workspace-creation-tour-handoff'
import { getSelectedTextForFileSearch } from '../editor/file-search-selection'
import { isEditableTarget } from '../keyboard-input/editable-target'
import { getRendererAppPlatform } from '../settings/renderer-app-platform'
import { runWorktreeDelete } from '../sidebar/delete-worktree/flow'
import { requestScrollToCurrentWorkspaceRevealAndRename } from '../sidebar/scroll-to-current-workspace-status'
import { requestWorktreeByIndex } from '../sidebar/worktree-navigation-request'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'
import { showTerminalShortcutCaptureNotification } from '../terminal-workspace/terminal-shortcut-capture-notification'
import {
  folderRelativePathToIncludeGlob,
  selectedExplorerFolderRelativePath
} from '../workspace-panel/file-explorer/file-search-include-pattern'
import { showWorkspacePanel, toggleWorkspacePanel } from '../workspace-panel/show-workspace-panel'
import { isWorkspaceBodyVisible } from './state/visible-surface'

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
  | 'activeGroupIdByWorktree'
  | 'activeWorktreeId'
  | 'groupsByWorktree'
  | 'keybindings'
  | 'unifiedTabsByWorktree'
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

/** The active group's canonical visual tab order, for the digit-index shortcuts. */
function orderedActiveGroupTabIds(state: GlobalShortcutState): readonly string[] {
  const worktreeId = state.activeWorktreeId
  if (!worktreeId) {
    return []
  }
  const groupId = state.activeGroupIdByWorktree[worktreeId]
  const group = state.groupsByWorktree[worktreeId]?.find((candidate) => candidate.id === groupId)
  return group?.tabOrder ?? []
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
    if (
      context === 'terminal' &&
      (state.terminalShortcutPolicy ?? 'agentstart-first') === 'agentstart-first'
    ) {
      showTerminalShortcutCaptureNotification({
        actionId,
        platform: shortcutPlatform,
        keybindings: state.keybindings
      })
    }
  }
  const canOpenWorkspacePanel =
    !state.creationLayoutActive &&
    isWorkspaceBodyVisible(state) &&
    state.activeWorktreeId !== null &&
    state.workspaceChromeActive
  const toggleSearchPanel = (query: string | null): void => {
    toggleWorkspacePanel({
      view: 'explorer',
      explorerDestination: { view: 'search', ...(query ? { query } : {}) }
    })
  }

  if (matchShortcut('sourceControl.sendReviewNotes') && canOpenWorkspacePanel) {
    if (useAppStore.getState().openDiffNotesSendMenuForActiveWorktree()) {
      input.preventDefault()
      notifyTerminalCapture('sourceControl.sendReviewNotes')
      showWorkspacePanel({ view: 'source-control' })
      return
    }
  }

  if (matchShortcut('sidebar.search.toggle') && canOpenWorkspacePanel) {
    const selectedFolderRelativePath =
      document.activeElement instanceof Element
        ? selectedExplorerFolderRelativePath(document.activeElement)
        : null
    if (selectedFolderRelativePath !== null && state.activeWorktreeId) {
      input.preventDefault()
      notifyTerminalCapture('sidebar.search.toggle')
      toggleWorkspacePanel({
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
      toggleSearchPanel(selectedText)
      return
    }
  }

  if (isEditableTarget(input.target)) {
    return
  }
  if (matchShortcut('worktree.history.back') || matchShortcut('worktree.history.forward')) {
    if (state.creationLayoutActive || !isWorkspaceBodyVisible(state)) {
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
  if (matchShortcut('workspace.create')) {
    // Why: the sidebar create control is disabled without a project, so the
    // shortcut must not open a composer the UI would refuse to.
    if (useAppStore.getState().repos.length === 0) {
      return
    }
    input.preventDefault()
    notifyTerminalCapture('workspace.create')
    openWorkspaceCreationComposerWithTourHandoff()
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
  if (state.workspaceChromeActive) {
    const tabIndex = matchKeybindingDigitIndex(
      'tab.selectByIndex',
      input,
      shortcutPlatform,
      state.keybindings,
      { context, terminalShortcutPolicy: state.terminalShortcutPolicy }
    )
    const tabId = tabIndex === null ? undefined : orderedActiveGroupTabIds(state)[tabIndex]
    if (tabId) {
      input.preventDefault()
      notifyTerminalCapture('tab.selectByIndex')
      useAppStore.getState().activateTab(tabId)
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
  if (matchShortcut('workspace.delete') && state.activeWorktreeId) {
    input.preventDefault()
    notifyTerminalCapture('workspace.delete')
    runWorktreeDelete(state.activeWorktreeId)
    return
  }
  // Why: the digit range belongs to the sidebar's own visibility pipeline, so the
  // request carries only the index and the sidebar resolves it against the rows
  // it is rendering.
  const workspaceIndex = matchKeybindingDigitIndex(
    'workspace.selectByIndex',
    input,
    shortcutPlatform,
    state.keybindings,
    { context, terminalShortcutPolicy: state.terminalShortcutPolicy }
  )
  if (workspaceIndex !== null) {
    input.preventDefault()
    notifyTerminalCapture('workspace.selectByIndex')
    requestWorktreeByIndex(workspaceIndex)
    return
  }
  if (!canOpenWorkspacePanel) {
    return
  }
  if (matchShortcut('sidebar.right.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.right.toggle')
    const store = useAppStore.getState()
    store.setWorkspacePanelOpen(!store.workspacePanelOpen)
    return
  }
  if (matchShortcut('sidebar.explorer.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.explorer.toggle')
    toggleWorkspacePanel({ view: 'explorer', explorerDestination: { view: 'files' } })
    return
  }
  if (matchShortcut('sidebar.search.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.search.toggle')
    toggleSearchPanel(null)
    return
  }
  if (matchShortcut('sidebar.sourceControl.toggle')) {
    if (document.querySelector('[data-terminal-search-root]')) {
      return
    }
    input.preventDefault()
    notifyTerminalCapture('sidebar.sourceControl.toggle')
    toggleWorkspacePanel({ view: 'source-control' })
    return
  }
  if (matchShortcut('sidebar.checks.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.checks.toggle')
    toggleWorkspacePanel({ view: 'source-control', sourceControlView: 'review' })
    return
  }
  if (matchShortcut('sidebar.ports.toggle')) {
    input.preventDefault()
    notifyTerminalCapture('sidebar.ports.toggle')
    toggleWorkspacePanel({ view: 'ports' })
  }
}
