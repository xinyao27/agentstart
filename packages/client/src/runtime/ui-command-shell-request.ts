import { CLOSE_TERMINAL_PANE_EVENT, SPLIT_TERMINAL_PANE_EVENT } from '~renderer/constants/terminal'
import type { CloseTerminalPaneDetail, SplitTerminalPaneDetail } from '~renderer/constants/terminal'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { basename } from '~renderer/path'
import { readProjectCatalogSnapshot } from '~renderer/project-catalog/catalog-snapshot'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { activateTabAndFocusPane } from '~renderer/tab-bar/activate-and-focus-pane'
import {
  guardPinnedTabClose,
  resolvePinnedTabLabel
} from '~renderer/tab-bar/state/pinned-close-guard'
import { closeTerminalTab } from '~renderer/terminal/tab-actions'
import { activateAndRevealKnownWorktree } from '~renderer/worktree/activation'
import { refreshWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

import {
  activateTerminalInitiatedWorktree,
  focusTerminalInitiatedTab,
  isRuntimeEnvironmentActive,
  resolveBrowserSessionTabTarget
} from '../application-shell/use-ipc-events'
import { createBackgroundSleepingAgentWakeDispatcher } from '../application-shell/wake-sleeping-agents-in-background'
import { closeMobileSessionTabInStore } from './mobile-session-tab-close'
import type { UiCommandRequest, UiCommandResult } from './shell-host/ui-request'

const backgroundSleepingAgentWakeDispatcher = createBackgroundSleepingAgentWakeDispatcher()

function isPinnedSessionTab(store: AppState, worktreeId: string, visibleId: string): boolean {
  return (store.unifiedTabsByWorktree?.[worktreeId] ?? []).some(
    (tab) => (tab.id === visibleId || tab.entityId === visibleId) && tab.isPinned
  )
}

async function activateNotifiedWorktree(
  command: Extract<UiCommandRequest, { type: 'activateWorktree' }>
): Promise<void> {
  if (isRuntimeEnvironmentActive()) {
    // Why: this reverse command targets the host shell's local worktree ids;
    // an active remote environment receives its own activation event stream.
    return
  }
  const existedBeforeFetch = Object.values(readProjectCatalogSnapshot().worktreesByRepo)
    .flat()
    .some((worktree) => worktree.id === command.worktreeId)
  const refreshed = await refreshWorktreeCatalog({ kind: 'local' }, command.repoId)
  const worktree = refreshed?.worktrees.find((candidate) => candidate.id === command.worktreeId)
  if (!worktree) {
    return
  }
  activateAndRevealKnownWorktree(worktree, {
    ...(command.setup ? { setup: command.setup } : {}),
    ...(command.startup ? { startup: command.startup } : {}),
    ...(command.defaultTabs ? { defaultTabs: command.defaultTabs } : {}),
    ...(!existedBeforeFetch ? { sidebarRevealBehavior: 'auto' } : {}),
    notifyHostRuntime: false
  })
}

export async function handleShellServicesUICommand(
  command: UiCommandRequest
): Promise<UiCommandResult> {
  switch (command.type) {
    case 'activateWorktree':
      void activateNotifiedWorktree(command).catch((error) => {
        console.error('Failed to activate CLI-created worktree:', error)
      })
      return { accepted: true }
    case 'splitTerminal': {
      const detail: SplitTerminalPaneDetail = {
        tabId: command.tabId,
        paneRuntimeId: command.paneRuntimeId,
        direction: command.direction,
        command: command.command,
        telemetrySource: command.telemetrySource
      }
      window.dispatchEvent(new CustomEvent(SPLIT_TERMINAL_PANE_EVENT, { detail }))
      return { accepted: true }
    }
    case 'renameTerminal':
      useAppStore.getState().setTabCustomTitle(command.tabId, command.title)
      return { accepted: true }
    case 'focusTerminal': {
      const store = useAppStore.getState()
      activateTerminalInitiatedWorktree(store, command.worktreeId)
      store.setActiveTab(command.tabId)
      store.revealWorktreeInSidebar(command.worktreeId)
      if (
        command.ackPaneKeyOnSuccess ||
        command.flashFocusedPane ||
        command.scrollToBottomIfOutputSinceLastView
      ) {
        activateTabAndFocusPane(command.tabId, command.leafId ?? null, {
          ...(command.ackPaneKeyOnSuccess
            ? { ackPaneKeyOnSuccess: command.ackPaneKeyOnSuccess }
            : {}),
          ...(command.flashFocusedPane ? { flashFocusedPane: true } : {}),
          ...(command.scrollToBottomIfOutputSinceLastView
            ? { scrollToBottomIfOutputSinceLastView: true }
            : {})
        })
        return { accepted: true }
      }
      focusTerminalInitiatedTab(command.tabId, command.leafId)
      return { accepted: true }
    }
    case 'focusEditorTab': {
      focusEditorTab(command)
      return { accepted: true }
    }
    case 'closeSessionTab':
      closeSessionTab(command)
      return { accepted: true }
    case 'moveSessionTab': {
      const store = useAppStore.getState()
      if (command.kind === 'reorder') {
        store.reorderUnifiedTabs(command.targetGroupId, command.tabOrder)
        return { accepted: true }
      }
      store.dropUnifiedTab(command.tabId, {
        groupId: command.targetGroupId,
        ...(command.kind === 'move-to-group' ? { index: command.index } : {}),
        ...(command.kind === 'split' ? { splitDirection: command.splitDirection } : {})
      })
      return { accepted: true }
    }
    case 'openFile': {
      const store = useAppStore.getState()
      const filename = basename(command.relativePath)
      activateEditorWorktree(store, command.worktreeId)
      store.openFile({
        filePath: command.filePath,
        relativePath: command.relativePath,
        worktreeId: command.worktreeId,
        language: detectLanguage(filename),
        runtimeEnvironmentId: command.runtimeEnvironmentId,
        mode: 'edit'
      })
      store.setActiveTabType('editor')
      store.revealWorktreeInSidebar(command.worktreeId)
      return { accepted: true }
    }
    case 'openDiff': {
      const store = useAppStore.getState()
      activateEditorWorktree(store, command.worktreeId)
      store.openDiff(
        command.worktreeId,
        command.filePath,
        command.relativePath,
        detectLanguage(command.relativePath),
        command.staged,
        { runtimeEnvironmentId: command.runtimeEnvironmentId }
      )
      store.setActiveTabType('editor')
      store.revealWorktreeInSidebar(command.worktreeId)
      return { accepted: true }
    }
    case 'closeTerminal':
      if (command.paneRuntimeId != null) {
        const detail: CloseTerminalPaneDetail = {
          tabId: command.tabId,
          paneRuntimeId: command.paneRuntimeId
        }
        window.dispatchEvent(new CustomEvent(CLOSE_TERMINAL_PANE_EVENT, { detail }))
      } else {
        closeTerminalTab(command.tabId)
      }
      return { accepted: true }
    case 'sleepWorktree':
      // Why: daemon has saved recovery state; the shell only releases its visible workspace.
      if (useAppStore.getState().activeWorktreeId === command.worktreeId) {
        useAppStore.getState().setActiveWorktree(null)
      }
      return { accepted: true }
    case 'resumeSleepingAgents':
      backgroundSleepingAgentWakeDispatcher.request(command.worktreeId)
      return { accepted: true }
  }
}

function focusEditorTab(command: Extract<UiCommandRequest, { type: 'focusEditorTab' }>): void {
  const store = useAppStore.getState()
  const tab = (store.unifiedTabsByWorktree[command.worktreeId] ?? []).find(
    (item) => item.id === command.tabId
  )
  const browserTarget = resolveBrowserSessionTabTarget(store, command.worktreeId, command.tabId)
  if (!tab) {
    if (browserTarget) {
      activateEditorWorktree(store, command.worktreeId)
      store.setActiveBrowserTab(browserTarget.workspaceId)
      store.setActiveTabType('browser')
      store.revealWorktreeInSidebar(command.worktreeId)
    }
    return
  }
  activateEditorWorktree(store, command.worktreeId)
  store.focusGroup(command.worktreeId, tab.groupId)
  store.activateTab(tab.id)
  if (browserTarget) {
    store.setActiveBrowserTab(browserTarget.workspaceId)
    store.setActiveTabType('browser')
  } else {
    store.setActiveFile(tab.entityId)
    store.setActiveTabType('editor')
  }
  store.revealWorktreeInSidebar(command.worktreeId)
}

function closeSessionTab(command: Extract<UiCommandRequest, { type: 'closeSessionTab' }>): void {
  const store = useAppStore.getState()
  const browserTarget = resolveBrowserSessionTabTarget(store, command.worktreeId, command.tabId)
  if (browserTarget) {
    guardPinnedTabClose({
      isPinned: isPinnedSessionTab(store, command.worktreeId, browserTarget.workspaceId),
      tabLabel: resolvePinnedTabLabel(store, command.worktreeId, browserTarget.workspaceId),
      onClose: () => useAppStore.getState().closeBrowserTab(browserTarget.workspaceId)
    })
    return
  }
  guardPinnedTabClose({
    isPinned: isPinnedSessionTab(store, command.worktreeId, command.tabId),
    tabLabel: resolvePinnedTabLabel(store, command.worktreeId, command.tabId),
    onClose: () =>
      closeMobileSessionTabInStore(useAppStore.getState(), command.worktreeId, command.tabId)
  })
}

function activateEditorWorktree(store: AppState, worktreeId: string): void {
  store.setActiveWorktree(worktreeId)
  store.markWorktreeVisited(worktreeId)
  store.setActiveView('terminal')
}
