import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import { buildDuplicatedBrowserTabOptions } from '~renderer/browser-tab-projection/duplicate-options'
import { openMobileEmulatorTab } from '~renderer/emulator-pane/open-tab'
import { useProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { browserWorkspaceHasRemoteOwner } from '~renderer/runtime/remote-browser-tab-ownership'
import {
  createRemoteRuntimeSessionBrowserTab,
  createRemoteRuntimeSessionTerminal
} from '~renderer/runtime/remote-runtime-session'
import { useAppStore } from '~renderer/store/state'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { openTabBarEntry, type TabCreateEntryArgs } from '../tab-bar/tab-create-entry-action'
import { ensureSimulatorTab, getSimulatorTabForWorktree } from './ensure-simulator-tab'

function recordTerminalTabGroupSplit(createdTerminal: TerminalTab | null | undefined): void {
  if (createdTerminal) {
    useAppStore.getState().recordFeatureInteraction('terminal-pane-split')
  }
}

export function useWorkspaceOpenCommands({
  groupId,
  mobileEmulatorEnabled,
  worktreeId
}: {
  groupId: string
  mobileEmulatorEnabled: boolean
  worktreeId: string
}) {
  const focusGroup = useAppStore((state) => state.focusGroup)
  const createTab = useAppStore((state) => state.createTab)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const setActiveTabType = useAppStore((state) => state.setActiveTabType)
  const createBrowserTab = useAppStore((state) => state.createBrowserTab)
  const createEmptySplitGroup = useAppStore((state) => state.createEmptySplitGroup)
  const openNewBrowserTabInActiveWorkspace = useAppStore(
    (state) => state.openNewBrowserTabInActiveWorkspace
  )
  const openNewMarkdownInActiveWorkspace = useAppStore(
    (state) => state.openNewMarkdownInActiveWorkspace
  )
  const openNewTerminalTabInActiveWorkspace = useAppStore(
    (state) => state.openNewTerminalTabInActiveWorkspace
  )
  const projectRuntimeState = useProjectCatalogRuntimeState()

  const createSplitGroup = (direction: 'left' | 'right' | 'up' | 'down') => {
    focusGroup(worktreeId, groupId)
    const newGroupId = createEmptySplitGroup(worktreeId, groupId, direction)
    if (!newGroupId) {
      return
    }
    // Why: this tab-strip control always seeds a terminal; drag-and-drop is
    // the separate path for opening other content in arbitrary directions.
    const terminal = createTab(worktreeId, newGroupId)
    recordTerminalTabGroupSplit(terminal)
    setActiveTab(terminal.id)
    setActiveTabType('terminal')
  }
  const duplicateBrowserTab = (browserTabId: string) => {
    void (async () => {
      const state = useAppStore.getState()
      const source = (state.browserTabsByWorktree[worktreeId] ?? []).find(
        (tab) => tab.id === browserTabId
      )
      if (!source) {
        return
      }
      const environmentId = getRuntimeEnvironmentIdForWorktree(projectRuntimeState, worktreeId)
      if (
        browserWorkspaceHasRemoteOwner(state, source.id, environmentId) &&
        (await createRemoteRuntimeSessionBrowserTab({
          worktreeId,
          environmentId,
          url: source.url,
          profileId: source.sessionProfileId,
          targetGroupId: groupId
        }))
      ) {
        return
      }
      createBrowserTab(worktreeId, source.url, {
        ...buildDuplicatedBrowserTabOptions(source),
        targetGroupId: groupId
      })
    })()
  }
  const newTerminalWithShell = (shellOverride: string) => {
    void (async () => {
      if (
        await createRemoteRuntimeSessionTerminal({
          worktreeId,
          environmentId: getRuntimeEnvironmentIdForWorktree(projectRuntimeState, worktreeId),
          targetGroupId: groupId,
          command: shellOverride,
          activate: true
        })
      ) {
        return
      }
      const terminal = createTab(worktreeId, groupId, shellOverride)
      setActiveTab(terminal.id)
      setActiveTabType('terminal')
      focusTerminalTabSurface(terminal.id)
    })()
  }
  const newSimulatorTab = () => {
    if (getSimulatorTabForWorktree(worktreeId)) {
      void ensureSimulatorTab(worktreeId, { surfacePane: true })
      return
    }
    // Why: a mobile simulator is most useful beside the current group.
    void openMobileEmulatorTab(worktreeId, { placement: 'rightSplit', targetGroupId: groupId })
  }
  const openEntry = async (args: TabCreateEntryArgs) => {
    await openTabBarEntry(args)
  }
  const newBrowserTab = () => {
    void openNewBrowserTabInActiveWorkspace(groupId)
  }
  // Why: these actions target their owning group explicitly because keyboard
  // activation can open the menu before global group focus changes.
  const newFileTab = async () => {
    await openNewMarkdownInActiveWorkspace(groupId)
  }
  const newTerminalTab = () => {
    void openNewTerminalTabInActiveWorkspace(groupId)
  }

  return {
    createSplitGroup,
    duplicateBrowserTab,
    newBrowserTab,
    newFileTab,
    newSimulatorTab: mobileEmulatorEnabled ? newSimulatorTab : undefined,
    newTerminalTab,
    newTerminalWithShell,
    openEntry
  }
}
