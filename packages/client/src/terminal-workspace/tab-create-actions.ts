import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { toast } from 'sonner'
import { launchAgentInNewTab } from '~renderer/agent/launch-in-new-tab'
import { buildDuplicatedBrowserTabOptions } from '~renderer/browser-tab-projection/duplicate-options'
import { openMobileEmulatorTab } from '~renderer/emulator-pane/open-tab'
import { translate } from '~renderer/i18n/i18n'
import { browserWorkspaceHasRemoteOwner } from '~renderer/runtime/remote-browser-tab-ownership'
import {
  createRemoteRuntimeSessionBrowserTab,
  createRemoteRuntimeSessionTerminal,
  isRemoteRuntimeSessionActive
} from '~renderer/runtime/remote-runtime-session'
import { useAppStore } from '~renderer/store/state'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'

import { openTabBarEntry, type TabCreateEntryArgs } from '../tab-bar/tab-create-entry-action'
import { getActiveWorktreeRuntimeEnvironmentId } from './tab-model-lookup'

type TabCreateActions = {
  handleNewTab: (shellOverride?: string) => void
  handleNewAgentTab: (agent: TuiAgent) => void
  handleNewSimulatorTab: () => void
  handleNewBrowserTab: () => void
  handleOpenEntry: (args: TabCreateEntryArgs) => Promise<void>
  handleDuplicateBrowserTab: (browserTabId: string) => void
  handleNewFile: () => Promise<void>
}

// Why: every "new tab" entry point (keyboard shortcut, tab-bar "+", agent
// launch menu) needs the same active-group resolution and remote-runtime-session
// routing, so they share one hook rather than re-deriving targetGroupId in
// each caller.
export function useTabCreateActions(): TabCreateActions {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const createTab = useAppStore((s) => s.createTab)
  const setActiveTabType = useAppStore((s) => s.setActiveTabType)
  const setTabBarOrder = useAppStore((s) => s.setTabBarOrder)
  const createBrowserTab = useAppStore((s) => s.createBrowserTab)
  const openNewBrowserTabInActiveWorkspace = useAppStore(
    (s) => s.openNewBrowserTabInActiveWorkspace
  )
  const openNewMarkdownInActiveWorkspace = useAppStore((s) => s.openNewMarkdownInActiveWorkspace)
  const openNewTerminalTabInActiveWorkspace = useAppStore(
    (s) => s.openNewTerminalTabInActiveWorkspace
  )

  const handleNewTab = (shellOverride?: string) => {
    if (!activeWorktreeId) {
      return
    }
    const targetGroupId =
      useAppStore.getState().activeGroupIdByWorktree[activeWorktreeId] ??
      useAppStore.getState().groupsByWorktree[activeWorktreeId]?.[0]?.id
    const runtimeEnvironmentId = getActiveWorktreeRuntimeEnvironmentId(activeWorktreeId)
    if (isRemoteRuntimeSessionActive(runtimeEnvironmentId)) {
      void createRemoteRuntimeSessionTerminal({
        worktreeId: activeWorktreeId,
        environmentId: runtimeEnvironmentId,
        targetGroupId,
        command: shellOverride,
        activate: true
      })
      return
    }
    if (!shellOverride && targetGroupId) {
      void openNewTerminalTabInActiveWorkspace(targetGroupId)
      return
    }
    const newTab = createTab(activeWorktreeId, undefined, shellOverride)
    setActiveTabType('terminal')
    // Why: persist the tab bar order with the new terminal at the end of the
    // current visual order. Without this, reconcileOrder falls back to
    // terminals-first when tabBarOrderByWorktree is unset, causing a new
    // terminal to jump to index 0 instead of appending after editor tabs.
    const state = useAppStore.getState()
    const currentTerminals = state.tabsByWorktree[activeWorktreeId] ?? []
    const currentEditors = state.openFiles.filter((f) => f.worktreeId === activeWorktreeId)
    const currentBrowsers = state.browserTabsByWorktree[activeWorktreeId] ?? []
    const stored = state.tabBarOrderByWorktree[activeWorktreeId]
    const termIds = currentTerminals.map((t) => t.id)
    const editorIds = currentEditors.map((f) => f.id)
    const browserIds = currentBrowsers.map((tab) => tab.id)
    const validIds = new Set([...termIds, ...editorIds, ...browserIds])
    const base = (stored ?? []).filter((id) => validIds.has(id))
    const inBase = new Set(base)
    for (const id of [...termIds, ...editorIds, ...browserIds]) {
      if (!inBase.has(id)) {
        base.push(id)
        inBase.add(id)
      }
    }
    // The new tab is already in base via termIds; move it to the end
    const order = base.filter((id) => id !== newTab.id)
    order.push(newTab.id)
    setTabBarOrder(activeWorktreeId, order)
    // Why: shell-specific creation still uses the legacy path; keep the
    // keyboard shortcut focused until the lifted action accepts shell overrides.
    focusTerminalTabSurface(newTab.id)
  }

  const handleNewAgentTab = async (agent: TuiAgent) => {
    if (!activeWorktreeId) {
      return
    }
    const state = useAppStore.getState()
    const targetGroupId =
      state.activeGroupIdByWorktree[activeWorktreeId] ??
      state.groupsByWorktree[activeWorktreeId]?.[0]?.id
    const result = await launchAgentInNewTab({
      agent,
      worktreeId: activeWorktreeId,
      groupId: targetGroupId,
      launchSource: 'shortcut'
    })
    if (!result) {
      toast.error(
        translate(
          'auto.components.Terminal.e57db40c11',
          'Could not build launch command for {{value0}}.',
          { value0: agent }
        )
      )
    }
  }

  const handleNewSimulatorTab = () => {
    if (!activeWorktreeId) {
      return
    }
    const targetGroupId =
      useAppStore.getState().activeGroupIdByWorktree[activeWorktreeId] ??
      useAppStore.getState().groupsByWorktree[activeWorktreeId]?.[0]?.id
    void openMobileEmulatorTab(activeWorktreeId, {
      placement: 'rightSplit',
      targetGroupId: targetGroupId ?? undefined
    })
  }

  const handleNewBrowserTab = () => {
    if (!activeWorktreeId) {
      return
    }
    const targetGroupId =
      useAppStore.getState().activeGroupIdByWorktree[activeWorktreeId] ??
      useAppStore.getState().groupsByWorktree[activeWorktreeId]?.[0]?.id
    if (targetGroupId) {
      void openNewBrowserTabInActiveWorkspace(targetGroupId)
      return
    }
    const defaultUrl = useAppStore.getState().browserDefaultUrl ?? 'about:blank'
    const runtimeEnvironmentId = getActiveWorktreeRuntimeEnvironmentId(activeWorktreeId)
    if (isRemoteRuntimeSessionActive(runtimeEnvironmentId)) {
      void createRemoteRuntimeSessionBrowserTab({
        worktreeId: activeWorktreeId,
        environmentId: runtimeEnvironmentId,
        url: defaultUrl
      })
      return
    }
    createBrowserTab(activeWorktreeId, defaultUrl, {
      title: translate('auto.components.Terminal.37da0d736f', 'New Browser Tab'),
      focusAddressBar: true
    })
  }

  const handleOpenEntry = async (args: TabCreateEntryArgs) => {
    await openTabBarEntry(args)
  }

  const handleDuplicateBrowserTab = (browserTabId: string) => {
    if (!activeWorktreeId) {
      return
    }
    const state = useAppStore.getState()
    const tabs = state.browserTabsByWorktree[activeWorktreeId] ?? []
    const source = tabs.find((t) => t.id === browserTabId)
    if (!source) {
      return
    }
    const runtimeEnvironmentId = getActiveWorktreeRuntimeEnvironmentId(activeWorktreeId)
    if (
      isRemoteRuntimeSessionActive(runtimeEnvironmentId) &&
      browserWorkspaceHasRemoteOwner(state, source.id, runtimeEnvironmentId)
    ) {
      void createRemoteRuntimeSessionBrowserTab({
        worktreeId: activeWorktreeId,
        environmentId: runtimeEnvironmentId,
        url: source.url,
        profileId: source.sessionProfileId
      })
      return
    }
    createBrowserTab(activeWorktreeId, source.url, {
      ...buildDuplicatedBrowserTabOptions(source)
    })
  }

  const handleNewFile = async () => {
    if (!activeWorktreeId) {
      return
    }
    const targetGroupId =
      useAppStore.getState().activeGroupIdByWorktree[activeWorktreeId] ??
      useAppStore.getState().groupsByWorktree[activeWorktreeId]?.[0]?.id
    if (!targetGroupId) {
      return
    }
    await openNewMarkdownInActiveWorkspace(targetGroupId)
  }

  return {
    handleNewTab,
    handleNewAgentTab,
    handleNewSimulatorTab,
    handleNewBrowserTab,
    handleOpenEntry,
    handleDuplicateBrowserTab,
    handleNewFile
  }
}
