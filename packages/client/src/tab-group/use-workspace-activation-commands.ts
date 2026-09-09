import type { Tab } from '@yiru/protocol/workspace/tabs'
import { TOGGLE_TERMINAL_PANE_EXPAND_EVENT } from '~renderer/constants/terminal'
import { useProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { browserWorkspaceHasRemoteOwner } from '~renderer/runtime/remote-browser-tab-ownership'
import {
  activateRemoteRuntimeSessionTab,
  isRemoteRuntimeSessionActive
} from '~renderer/runtime/remote-runtime-session'
import { useAppStore } from '~renderer/store/state'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

type TerminalLayoutsByTabId = NonNullable<
  ReturnType<typeof useAppStore.getState>['terminalLayoutsByTabId']
>

export function useWorkspaceActivationCommands({
  groupId,
  groupTabs,
  terminalLayoutsByTabId,
  worktreeId
}: {
  groupId: string
  groupTabs: readonly Tab[]
  terminalLayoutsByTabId: TerminalLayoutsByTabId
  worktreeId: string
}) {
  const focusGroup = useAppStore((state) => state.focusGroup)
  const activateTab = useAppStore((state) => state.activateTab)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const setActiveFile = useAppStore((state) => state.setActiveFile)
  const setActiveTabType = useAppStore((state) => state.setActiveTabType)
  const setActiveBrowserTab = useAppStore((state) => state.setActiveBrowserTab)
  const projectRuntimeState = useProjectCatalogRuntimeState()

  const activateTerminal = (terminalId: string) => {
    const item = groupTabs.find(
      (candidate) => candidate.entityId === terminalId && candidate.contentType === 'terminal'
    )
    if (!item) {
      return
    }
    focusGroup(worktreeId, groupId)
    activateTab(item.id)
    const environmentId = getRuntimeEnvironmentIdForWorktree(projectRuntimeState, worktreeId)
    if (isRemoteRuntimeSessionActive(environmentId)) {
      void activateRemoteRuntimeSessionTab({ worktreeId, tabId: terminalId, environmentId })
    }
    setActiveTab(terminalId)
    setActiveTabType('terminal')
    const activeLeafId = terminalLayoutsByTabId[terminalId]?.activeLeafId ?? null
    // Why: activation must restore xterm focus to the store-active leaf so
    // keyboard input cannot drift to a sibling pane.
    focusTerminalTabSurface(terminalId, activeLeafId)
  }
  const toggleTerminalPaneExpand = (terminalId: string) => {
    const item = groupTabs.find(
      (candidate) => candidate.entityId === terminalId && candidate.contentType === 'terminal'
    )
    if (!item) {
      return
    }
    // Why: the collapse icon stops pointer propagation and therefore does
    // not run normal tab activation before toggling pane layout.
    activateTerminal(terminalId)
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, { detail: { tabId: terminalId } })
      )
    })
  }
  const activateEditor = (tabId: string) => {
    const item = groupTabs.find((candidate) => candidate.id === tabId)
    if (!item) {
      return
    }
    focusGroup(worktreeId, groupId)
    activateTab(item.id)
    if (item.contentType === 'simulator') {
      setActiveTabType('simulator')
    } else {
      setActiveFile(item.entityId)
      setActiveTabType('editor')
    }
  }
  const activateBrowser = (browserTabId: string) => {
    const item = groupTabs.find(
      (candidate) => candidate.entityId === browserTabId && candidate.contentType === 'browser'
    )
    if (!item) {
      return
    }
    focusGroup(worktreeId, groupId)
    activateTab(item.id)
    const environmentId = getRuntimeEnvironmentIdForWorktree(projectRuntimeState, worktreeId)
    if (
      isRemoteRuntimeSessionActive(environmentId) &&
      browserWorkspaceHasRemoteOwner(useAppStore.getState(), browserTabId, environmentId)
    ) {
      void activateRemoteRuntimeSessionTab({ worktreeId, tabId: item.id, environmentId })
    }
    setActiveBrowserTab(browserTabId)
    setActiveTabType('browser')
  }
  const activateGitGraph = (tabId: string) => {
    const item = groupTabs.find(
      (candidate) => candidate.id === tabId && candidate.contentType === 'git-graph'
    )
    if (!item) {
      return
    }
    focusGroup(worktreeId, groupId)
    activateTab(item.id)
    setActiveTabType('editor')
  }

  return {
    activateBrowser,
    activateEditor,
    activateGitGraph,
    activateTerminal,
    focusGroup: () => focusGroup(worktreeId, groupId),
    toggleTerminalPaneExpand
  }
}
