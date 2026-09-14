import { useAppStore } from '~renderer/store/state'
import { returnToWorkspaceView } from '~renderer/workspace/return-to-workspace-view'

import { useWorkspaceActivationCommands } from './use-workspace-activation-commands'
import { useWorkspaceCloseCommands } from './use-workspace-close-commands'
import { useWorkspaceOpenCommands } from './use-workspace-open-commands'
import { useTabGroupWorkspaceItems } from './workspace-items'

// Why: top-level pages keep this group's strip hosted in the shared titlebar.
// Acting on a workspace surface command from that strip must also leave the
// page view, or the action would target a hidden workspace body. Close and
// metadata commands deliberately stay unwrapped: closing or recoloring a
// background tab should not yank the user out of the open page.
function withWorkspaceSurfaceReturn<Arguments extends unknown[], Result>(
  command: (...arguments_: Arguments) => Result
): (...arguments_: Arguments) => Result {
  return (...arguments_) => {
    returnToWorkspaceView()
    return command(...arguments_)
  }
}

export function useTabGroupWorkspaceModel({
  groupId,
  worktreeId
}: {
  groupId: string
  worktreeId: string
}) {
  const items = useTabGroupWorkspaceItems({ groupId, worktreeId })
  const activationCommands = useWorkspaceActivationCommands({
    groupId,
    groupTabs: items.groupTabs,
    terminalLayoutsByTabId: items.terminalLayoutsByTabId,
    worktreeId
  })
  const closeCommands = useWorkspaceCloseCommands({
    group: items.group,
    groupId,
    groupTabs: items.groupTabs,
    worktreeId
  })
  const openCommands = useWorkspaceOpenCommands({
    groupId,
    mobileEmulatorEnabled: items.mobileEmulatorEnabled,
    worktreeId
  })
  const makePreviewFilePermanent = useAppStore((state) => state.makePreviewFilePermanent)
  const pinFile = useAppStore((state) => state.pinFile)
  const setTabCustomTitle = useAppStore((state) => state.setTabCustomTitle)
  const setTabColor = useAppStore((state) => state.setTabColor)

  return {
    activeTab: items.activeTab,
    browserItems: items.browserItems,
    editorItems: items.editorItems,
    expandedPaneByTabId: items.expandedPaneByTabId,
    group: items.group,
    groupTabs: items.groupTabs,
    tabBarOrder: items.tabBarOrder,
    terminalTabs: items.terminalTabs,
    commands: {
      activateBrowser: withWorkspaceSurfaceReturn(activationCommands.activateBrowser),
      activateEditor: withWorkspaceSurfaceReturn(activationCommands.activateEditor),
      activateGitGraph: withWorkspaceSurfaceReturn(activationCommands.activateGitGraph),
      activateTerminal: withWorkspaceSurfaceReturn(activationCommands.activateTerminal),
      focusGroup: withWorkspaceSurfaceReturn(activationCommands.focusGroup),
      toggleTerminalPaneExpand: withWorkspaceSurfaceReturn(
        activationCommands.toggleTerminalPaneExpand
      ),
      createSplitGroup: withWorkspaceSurfaceReturn(openCommands.createSplitGroup),
      duplicateBrowserTab: withWorkspaceSurfaceReturn(openCommands.duplicateBrowserTab),
      newBrowserTab: withWorkspaceSurfaceReturn(openCommands.newBrowserTab),
      newFileTab: withWorkspaceSurfaceReturn(openCommands.newFileTab),
      newSimulatorTab: openCommands.newSimulatorTab
        ? withWorkspaceSurfaceReturn(openCommands.newSimulatorTab)
        : undefined,
      newTerminalTab: withWorkspaceSurfaceReturn(openCommands.newTerminalTab),
      newTerminalWithShell: withWorkspaceSurfaceReturn(openCommands.newTerminalWithShell),
      openEntry: withWorkspaceSurfaceReturn(openCommands.openEntry),
      ...closeCommands,
      makePreviewFilePermanent,
      pinFile,
      setTabColor,
      setTabCustomTitle
    }
  }
}
