import type { WorkspaceSessionState } from '@yiru/protocol/workspace/session'
import type {
  Tab,
  TabContentType,
  TabGroup,
  TabGroupLayoutNode
} from '@yiru/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'
import type { TabSplitDirection } from '~renderer/tab-bar/split-direction'
import type { WorkspaceSessionHydrationOptions } from '~renderer/workspace/session-hydration-keys'

import type { AppState } from '../../store/types'
import { createActivationActions } from './activation-actions'
import { createCreateActions } from './create-actions'
import { createDropActions } from './drop-actions'
import { createGroupLayoutActions } from './group-layout-actions'
import { createGroupLifecycleActions } from './group-lifecycle-actions'
import { createHydrationActions } from './hydration-actions'
import { createMoveActions } from './move-actions'
import { createPinActions } from './pin-actions'
import { createReconciliationActions } from './reconciliation-actions'
import { createTabLifecycleActions } from './tab-lifecycle-actions'

export type { TabSplitDirection } from '~renderer/tab-bar/split-direction'
export { findSiblingGroupId } from './model'

export type TabsSlice = {
  unifiedTabsByWorktree: Record<string, Tab[]>
  // Why: signals the matching tab's inline title editor to open. A global
  // keyboard shortcut (tab.rename) sets this; the tab clears it on consume.
  renamingTabId: string | null
  groupsByWorktree: Record<string, TabGroup[]>
  activeGroupIdByWorktree: Record<string, string>
  layoutByWorktree: Record<string, TabGroupLayoutNode>
  createUnifiedTab: (
    worktreeId: string,
    contentType: TabContentType,
    init?: Partial<
      Pick<
        Tab,
        | 'id'
        | 'entityId'
        | 'label'
        | 'generatedLabel'
        | 'quickCommandLabel'
        | 'customLabel'
        | 'color'
        | 'isPreview'
        | 'isPinned'
      > & {
        targetGroupId: string
        activate: boolean
        recordInteraction: boolean
      }
    >
  ) => Tab
  createUnifiedTabInSplit: (
    worktreeId: string,
    contentType: TabContentType,
    target: {
      sourceGroupId: string
      splitDirection: TabSplitDirection
    },
    init?: Partial<
      Pick<
        Tab,
        | 'id'
        | 'entityId'
        | 'label'
        | 'generatedLabel'
        | 'quickCommandLabel'
        | 'customLabel'
        | 'color'
        | 'isPreview'
        | 'isPinned'
      > & {
        activate: boolean
        recordInteraction: boolean
      }
    >
  ) => Tab | null
  getTab: (tabId: string) => Tab | null
  getActiveTab: (worktreeId: string) => Tab | null
  findTabForEntityInGroup: (
    worktreeId: string,
    groupId: string,
    entityId: string,
    contentType?: TabContentType
  ) => Tab | null
  activateTab: (tabId: string, opts?: { preservePreview?: boolean }) => void
  closeUnifiedTab: (
    tabId: string,
    opts?: { recordInteraction?: boolean; terminalRetirementHandled?: boolean }
  ) => { closedTabId: string; wasLastTab: boolean; worktreeId: string } | null
  reorderUnifiedTabs: (
    groupId: string,
    tabIds: string[],
    opts?: { recordInteraction?: boolean }
  ) => void
  setTabLabel: (tabId: string, label: string) => void
  setTabCustomLabel: (
    tabId: string,
    label: string | null,
    opts?: { recordInteraction?: boolean }
  ) => void
  setUnifiedTabColor: (tabId: string, color: string | null) => void
  setRenamingTabId: (tabId: string | null) => void
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void
  closeOtherTabs: (tabId: string) => string[]
  closeTabsToRight: (tabId: string) => string[]
  ensureWorktreeRootGroup: (worktreeId: string) => string
  focusGroup: (worktreeId: string, groupId: string) => void
  closeEmptyGroup: (worktreeId: string, groupId: string) => boolean
  createEmptySplitGroup: (
    worktreeId: string,
    sourceGroupId: string,
    direction: TabSplitDirection
  ) => string | null
  moveUnifiedTabToGroup: (
    tabId: string,
    targetGroupId: string,
    opts?: { index?: number; activate?: boolean; recordInteraction?: boolean }
  ) => boolean
  dropUnifiedTab: (
    tabId: string,
    target: {
      groupId: string
      index?: number
      splitDirection?: TabSplitDirection
    }
  ) => boolean
  copyUnifiedTabToGroup: (
    tabId: string,
    targetGroupId: string,
    init?: Partial<
      Pick<
        Tab,
        | 'id'
        | 'entityId'
        | 'label'
        | 'generatedLabel'
        | 'quickCommandLabel'
        | 'customLabel'
        | 'color'
        | 'isPinned'
      >
    >
  ) => Tab | null
  mergeGroupIntoSibling: (worktreeId: string, groupId: string) => string | null
  setTabGroupSplitRatio: (worktreeId: string, nodePath: string, ratio: number) => void
  reconcileWorktreeTabModel: (worktreeId: string) => {
    renderableTabCount: number
    activeRenderableTabId: string | null
  }
  hydrateTabsSession: (
    session: WorkspaceSessionState,
    options?: WorkspaceSessionHydrationOptions
  ) => void
}

export const createTabsSlice: StateCreator<AppState, [], [], TabsSlice> = (set, get) => ({
  unifiedTabsByWorktree: {},
  renamingTabId: null,
  groupsByWorktree: {},
  activeGroupIdByWorktree: {},
  layoutByWorktree: {},

  ...createCreateActions(set, get),

  ...createActivationActions(set, get),

  ...createTabLifecycleActions(set, get),

  ...createPinActions(set, get),

  ...createGroupLifecycleActions(set, get),

  ...createMoveActions(set, get),

  ...createDropActions(set, get),

  ...createGroupLayoutActions(set, get),

  ...createReconciliationActions(set, get),

  ...createHydrationActions(set, get)
})
