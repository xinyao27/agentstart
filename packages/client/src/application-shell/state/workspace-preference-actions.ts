import {
  normalizeExecutionHostOrder,
  normalizeExecutionHostScope,
  normalizeVisibleExecutionHostIds
} from '@agentstart/protocol/host/identity'
import { normalizeWorkspacePanelTitlebarPinnedIds } from '@agentstart/protocol/settings/panel-titlebar-pins'
import { DEFAULT_STATUS_BAR_ITEMS } from '@agentstart/protocol/settings/status-bar'
import type { WorkspaceHostScope } from '@agentstart/protocol/settings/ui-state'
import { normalizeStatusBarUsageMode } from '@agentstart/protocol/settings/usage-display'
import { normalizeUsagePercentageDisplay } from '@agentstart/protocol/settings/usage-display'
import { normalizeWorktreeCardProperties } from '@agentstart/protocol/settings/worktree-card-properties'
import { normalizeWorkspaceStatuses } from '@agentstart/protocol/workspace/status/normalize'
import type { StateCreator } from 'zustand'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'

import type { AppState } from '../../store/types'
import type { UISlice } from './slice'

export function createUIWorkspacePreferenceActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'setGroupBy'
  | 'setSortBy'
  | 'setProjectOrderBy'
  | 'setShowActiveOnly'
  | 'setShowSleepingWorkspaces'
  | 'setWorkspaceHostScope'
  | 'setVisibleWorkspaceHostIds'
  | 'setWorkspaceHostOrder'
  | 'setHideDefaultBranchWorkspace'
  | 'setShowDotfilesForWorktree'
  | 'toggleShowDotfilesForWorktree'
  | 'setFilterRepoIds'
  | 'toggleCollapsedGroup'
  | 'setWorktreeCardProperties'
  | 'setWorkspaceStatuses'
  | 'toggleStatusBarItem'
  | 'setStatusBarVisible'
  | 'setWorkspacePanelTitlebarPinnedIds'
  | 'setUsagePercentageDisplay'
  | 'setStatusBarUsageMode'
> {
  return {
    setGroupBy: (g) => {
      setRuntimeUIState(get().settings, { groupBy: g, collapsedGroups: [] }).catch(console.error)
      set({ groupBy: g, collapsedGroups: new Set<string>() })
    },
    setSortBy: (s) => set({ sortBy: s }),
    setProjectOrderBy: (p) => set({ projectOrderBy: p }),
    setShowActiveOnly: (v) => set({ showActiveOnly: v }),
    setShowSleepingWorkspaces: (v) => set({ showSleepingWorkspaces: v }),
    setWorkspaceHostScope: (scope) => {
      const normalized = normalizeExecutionHostScope(scope)
      const visibleWorkspaceHostIds = normalized === 'all' ? null : [normalized]
      set({ workspaceHostScope: normalized, visibleWorkspaceHostIds })
      setRuntimeUIState(get().settings, {
        workspaceHostScope: normalized,
        visibleWorkspaceHostIds
      }).catch(console.error)
    },
    setVisibleWorkspaceHostIds: (ids) => {
      const normalized = normalizeVisibleExecutionHostIds(ids)
      // Why: workspaceHostScope remains the compatibility/default-host signal
      // for creation flows while visibility can now be multi-select.
      let workspaceHostScope: WorkspaceHostScope = get().workspaceHostScope
      if (normalized === null) {
        workspaceHostScope = 'all'
      } else if (normalized.length === 1) {
        workspaceHostScope = normalized[0]
      }
      set({ visibleWorkspaceHostIds: normalized, workspaceHostScope })
      setRuntimeUIState(get().settings, {
        visibleWorkspaceHostIds: normalized,
        workspaceHostScope
      }).catch(console.error)
    },
    setWorkspaceHostOrder: (ids) => {
      const workspaceHostOrder = normalizeExecutionHostOrder(ids)
      set({ workspaceHostOrder })
      setRuntimeUIState(get().settings, { workspaceHostOrder }).catch(console.error)
    },
    setHideDefaultBranchWorkspace: (v) => set({ hideDefaultBranchWorkspace: v }),
    setShowDotfilesForWorktree: (worktreeId, showDotfiles) =>
      set((s) => {
        if (!worktreeId) {
          return s
        }
        const current = s.showDotfilesByWorktree[worktreeId] ?? true
        if (current === showDotfiles) {
          return s
        }
        const next = { ...s.showDotfilesByWorktree }
        // Why: showing dotfiles is the default; only persist worktree-level opt-outs.
        if (showDotfiles) {
          delete next[worktreeId]
        } else {
          next[worktreeId] = false
        }
        return { showDotfilesByWorktree: next }
      }),
    toggleShowDotfilesForWorktree: (worktreeId) =>
      set((s) => {
        if (!worktreeId) {
          return s
        }
        const nextShowDotfiles = !(s.showDotfilesByWorktree[worktreeId] ?? true)
        const next = { ...s.showDotfilesByWorktree }
        if (nextShowDotfiles) {
          delete next[worktreeId]
        } else {
          next[worktreeId] = false
        }
        return { showDotfilesByWorktree: next }
      }),
    setFilterRepoIds: (ids) => set({ filterRepoIds: ids }),
    toggleCollapsedGroup: (key) =>
      set((s) => {
        const next = new Set(s.collapsedGroups)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        setRuntimeUIState(get().settings, { collapsedGroups: [...next] }).catch(console.error)
        return { collapsedGroups: next }
      }),
    setWorktreeCardProperties: (properties) => {
      const normalized = normalizeWorktreeCardProperties(properties)
      set({ worktreeCardProperties: normalized })
      setRuntimeUIState(get().settings, { worktreeCardProperties: normalized }).catch(console.error)
    },
    setWorkspaceStatuses: (statuses) => {
      const normalized = normalizeWorkspaceStatuses(statuses)
      setRuntimeUIState(get().settings, { workspaceStatuses: normalized }).catch(console.error)
      set({ workspaceStatuses: normalized })
    },
    toggleStatusBarItem: (item) =>
      set((s) => {
        const current = s.statusBarItems || DEFAULT_STATUS_BAR_ITEMS
        const updated = current.includes(item)
          ? current.filter((i) => i !== item)
          : [...current, item]
        setRuntimeUIState(get().settings, { statusBarItems: updated }).catch(console.error)
        return { statusBarItems: updated }
      }),
    setStatusBarVisible: (v) => {
      setRuntimeUIState(get().settings, { statusBarVisible: v }).catch(console.error)
      set({ statusBarVisible: v })
    },
    setWorkspacePanelTitlebarPinnedIds: (ids) => {
      const normalized = normalizeWorkspacePanelTitlebarPinnedIds(ids)
      setRuntimeUIState(get().settings, { workspacePanelTitlebarPinnedIds: normalized }).catch(
        console.error
      )
      set({ workspacePanelTitlebarPinnedIds: normalized })
    },
    setUsagePercentageDisplay: (display) => {
      const normalized = normalizeUsagePercentageDisplay(display)
      // Why: changing the control is the discovery path; permanently dismiss the
      // one-time change notice so it does not reappear after the user adapted.
      setRuntimeUIState(get().settings, {
        usagePercentageDisplay: normalized,
        usagePercentageDisplayChangeNoticeDismissed: true
      }).catch(console.error)
      set({
        usagePercentageDisplay: normalized,
        usagePercentageDisplayChangeNoticeDismissed: true
      })
    },
    setStatusBarUsageMode: (mode) => {
      const normalized = normalizeStatusBarUsageMode(mode)
      setRuntimeUIState(get().settings, { statusBarUsageMode: normalized }).catch(console.error)
      set({ statusBarUsageMode: normalized })
    }
  }
}
