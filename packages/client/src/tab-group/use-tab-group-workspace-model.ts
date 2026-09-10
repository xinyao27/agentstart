import { useAppStore } from '~renderer/store/state'

import { useWorkspaceActivationCommands } from './use-workspace-activation-commands'
import { useWorkspaceCloseCommands } from './use-workspace-close-commands'
import { useWorkspaceOpenCommands } from './use-workspace-open-commands'
import { useTabGroupWorkspaceItems } from './workspace-items'

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
      ...activationCommands,
      ...closeCommands,
      ...openCommands,
      makePreviewFilePermanent,
      pinFile,
      setTabColor,
      setTabCustomTitle
    }
  }
}
