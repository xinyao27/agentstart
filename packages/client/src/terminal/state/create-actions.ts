import { isValidHostTerminalTabId } from '@yiru/protocol/terminal/tab-identity'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'

import type { AppState } from '../../store/types'
import {
  dedupeTabOrder,
  ensureGroup,
  findTabByEntityInGroup,
  pushRecentTabId,
  sanitizeRecentTabIds,
  updateGroup
} from '../../tab-bar/state/group-state'
import { emptyLayoutSnapshot } from './layout-state'
import {
  buildOrphanTerminalCleanupPatch,
  dropOrphanTerminalAgentStatus,
  getOrphanTerminalIds
} from './orphan-state'
import {
  resolveCreatedTabShellOverride,
  worktreeUsesWslPath,
  getRemoteConnectionIdForWorktree
} from './runtime-model'
import type { TerminalSlice } from './slice'
import { getNextTerminalOrdinal } from './tab-model'

export function createTerminalCreateActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'createTab'> {
  return {
    createTab: (worktreeId, targetGroupId, shellOverride, options) => {
      let tab!: TerminalTab
      let sweptOrphanTerminalIds: ReadonlySet<string> = new Set<string>()
      set((s) => {
        const orphanTerminalIds = getOrphanTerminalIds(s, worktreeId)
        sweptOrphanTerminalIds = orphanTerminalIds
        const orphanCleanupPatch = buildOrphanTerminalCleanupPatch(s, worktreeId, orphanTerminalIds)
        const existing = (s.tabsByWorktree[worktreeId] ?? []).filter(
          (entry) => !orphanTerminalIds.has(entry.id)
        )
        // Why: caller-supplied id (e.g. main pre-allocates the tabId for CLI
        // background terminals so the paneKey env baked into the PTY matches
        // the renderer's tab id). Fall back to minting if the id collides — a
        // collision would alias two distinct PTYs to one tab id and silently
        // corrupt agent-status routing. Hook attribution degrades for that
        // single terminal because paneKey is already baked into PTY env, but
        // the rest of the tab works normally. See docs/cli-terminal-hook-pane-key.md.
        // Why: only honor a hint that's a non-empty trimmed string. The IPC
        // boundary at use-ipc-events.ts spreads `id` whenever `tabId !== undefined`,
        // so a stray `''` or whitespace-only value from a future producer would
        // otherwise be persisted as a real tab id and break paneKey routing
        // (`${tabId}:${leafId}` would inherit the bad tab segment).
        const trimmedHint = typeof options?.id === 'string' ? options.id.trim() : ''
        const hintedId =
          trimmedHint.length > 0 && isValidHostTerminalTabId(trimmedHint) ? trimmedHint : undefined
        const idCollides =
          hintedId !== undefined &&
          Object.values(s.tabsByWorktree).some((tabs) =>
            tabs.some((entry) => entry.id === hintedId)
          )
        if (idCollides) {
          console.warn(
            `[createTab] tabId hint ${hintedId} already exists; minting a fresh id (hook attribution will degrade for this terminal)`
          )
        }
        const id = hintedId !== undefined && !idCollides ? hintedId : createBrowserUuid()
        const shouldActivate = options?.activate !== false
        const nextOrdinal = getNextTerminalOrdinal(existing)
        const defaultTitle = `Terminal ${nextOrdinal}`
        const quickCommandLabel = options?.quickCommandLabel?.trim()
        const startupCwd = options?.startupCwd
        const remoteConnectionId = getRemoteConnectionIdForWorktree(s, worktreeId)
        const isRemoteWorktree = Boolean(remoteConnectionId)
        const isWslWorktree = worktreeUsesWslPath(s, worktreeId)
        const createdShellOverride = resolveCreatedTabShellOverride(
          shellOverride,
          s.settings?.terminalWindowsShell,
          // Why: SSH PTYs ignore local Windows shell selection; persisting a
          // local shell icon would mislabel a remote terminal.
          isRemoteWorktree,
          remoteConnectionId
            ? ((s.sshConnectionStates.get(remoteConnectionId)
                ?.remotePlatform as NodeJS.Platform | null) ?? null)
            : null,
          // Why: WSL UNC worktrees are repo-scoped WSL environments. New default
          // terminals should enter that distro even when the global Windows shell
          // preference is PowerShell or cmd.exe.
          isWslWorktree,
          isRemoteWorktree ? undefined : getLocalProjectExecutionRuntimeContext(s, worktreeId)
        )
        tab = {
          id,
          // Why: CLI-created background sessions already own a PTY; revealing
          // one later should attach the pane instead of spawning a duplicate.
          ptyId: options?.initialPtyId ?? null,
          worktreeId,
          // Why: users expect terminal labels to reflect the currently open set,
          // not a monotonic creation counter. Reusing the lowest free ordinal
          // keeps a lone fresh terminal at "Terminal 1" after older tabs close.
          title: defaultTitle,
          defaultTitle,
          ...(quickCommandLabel ? { quickCommandLabel } : {}),
          customTitle: null,
          color: null,
          sortOrder: existing.length,
          createdAt: Date.now(),
          ...(createdShellOverride !== undefined ? { shellOverride: createdShellOverride } : {}),
          ...(startupCwd && startupCwd.length > 0 ? { startupCwd } : {}),
          ...(options?.launchAgent ? { launchAgent: options.launchAgent } : {}),
          // Why: when terminal-workspace.tsx's activation fallback auto-creates a tab for a
          // first-visit worktree, the resulting PTY spawn is caused by the user
          // clicking the worktree, not by work happening in it. Tagging the tab
          // lets updateTabPtyId suppress the activity bump and sortEpoch bump.
          // Without this, clicking a never-visited worktree would stamp
          // lastActivityAt and reorder Recent/Smart on click — same bug class as
          // the generation-bump → remount path, different code path.
          ...(options?.pendingActivationSpawn ? { pendingActivationSpawn: true } : {})
        }
        const validTargetGroupId =
          targetGroupId &&
          s.groupsByWorktree[worktreeId]?.some((group) => group.id === targetGroupId)
            ? targetGroupId
            : undefined
        const { group, groupsByWorktree, activeGroupIdByWorktree } = ensureGroup(
          s.groupsByWorktree,
          s.activeGroupIdByWorktree,
          worktreeId,
          validTargetGroupId ?? s.activeGroupIdByWorktree[worktreeId]
        )
        const nextActiveGroupIdByWorktree =
          shouldActivate && validTargetGroupId
            ? { ...activeGroupIdByWorktree, [worktreeId]: validTargetGroupId }
            : activeGroupIdByWorktree
        const existingUnifiedTabs = s.unifiedTabsByWorktree[worktreeId] ?? []
        const existingTerminalTab = findTabByEntityInGroup(
          s.unifiedTabsByWorktree,
          worktreeId,
          group.id,
          id,
          'terminal'
        )
        const groupsForWorktree = groupsByWorktree[worktreeId] ?? []
        const cleanedGroups =
          orphanTerminalIds.size === 0
            ? groupsForWorktree
            : groupsForWorktree.map((entry) => {
                // Why: orphan cleanup must repair every group before adding the
                // new tab, or inactive/background creation can revive stale focus.
                const tabOrder = dedupeTabOrder(entry.tabOrder).filter(
                  (tabId) => !orphanTerminalIds.has(tabId)
                )
                const recentTabIds = sanitizeRecentTabIds(entry.recentTabIds, tabOrder)
                const replacedActiveTabId = Boolean(
                  entry.activeTabId && orphanTerminalIds.has(entry.activeTabId)
                )
                const fallbackActiveTabId = recentTabIds.at(-1) ?? tabOrder[0] ?? null
                const activeTabId = replacedActiveTabId ? fallbackActiveTabId : entry.activeTabId
                return {
                  ...entry,
                  activeTabId,
                  tabOrder,
                  recentTabIds:
                    replacedActiveTabId && activeTabId
                      ? pushRecentTabId(recentTabIds, activeTabId)
                      : recentTabIds
                }
              })
        const cleanedTargetGroup = cleanedGroups.find((entry) => entry.id === group.id) ?? group
        const cleanedGroupOrder = dedupeTabOrder(cleanedTargetGroup.tabOrder).filter(
          (tabId) => !orphanTerminalIds.has(tabId)
        )
        const unifiedTab = existingTerminalTab ?? {
          id,
          entityId: id,
          groupId: group.id,
          worktreeId,
          contentType: 'terminal' as const,
          label: tab.title,
          ...(tab.quickCommandLabel?.trim()
            ? { quickCommandLabel: tab.quickCommandLabel.trim() }
            : {}),
          customLabel: tab.customTitle,
          color: tab.color,
          sortOrder: cleanedGroupOrder.length,
          createdAt: tab.createdAt
        }
        const nextGroupOrder = dedupeTabOrder([...cleanedGroupOrder, unifiedTab.id])
        const nextRecent = shouldActivate
          ? pushRecentTabId(sanitizeRecentTabIds(group.recentTabIds, nextGroupOrder), unifiedTab.id)
          : sanitizeRecentTabIds(cleanedTargetGroup.recentTabIds, nextGroupOrder)
        const cleanedActiveTabIdForWorktree = orphanCleanupPatch.activeTabIdByWorktree[worktreeId]
        const cleanedGroupActiveTabId =
          cleanedTargetGroup.activeTabId && !orphanTerminalIds.has(cleanedTargetGroup.activeTabId)
            ? cleanedTargetGroup.activeTabId
            : null
        const nextActiveTabIdForWorktree = shouldActivate
          ? tab.id
          : (cleanedActiveTabIdForWorktree ?? cleanedGroupActiveTabId ?? tab.id)
        return {
          ...orphanCleanupPatch,
          tabsByWorktree: {
            ...orphanCleanupPatch.tabsByWorktree,
            [worktreeId]: [...existing, tab]
          },
          // Why: workspace creation queues startup/setup work before React mounts
          // the terminal. Publishing the unified tab atomically with the runtime
          // tab prevents a transient legacy mount from racing the split host.
          unifiedTabsByWorktree: {
            ...s.unifiedTabsByWorktree,
            [worktreeId]: existingTerminalTab
              ? existingUnifiedTabs
              : [...existingUnifiedTabs, unifiedTab]
          },
          groupsByWorktree: {
            ...groupsByWorktree,
            [worktreeId]: updateGroup(cleanedGroups, {
              ...cleanedTargetGroup,
              activeTabId: shouldActivate
                ? unifiedTab.id
                : (cleanedGroupActiveTabId ?? unifiedTab.id),
              tabOrder: nextGroupOrder,
              recentTabIds: nextRecent
            })
          },
          activeGroupIdByWorktree: nextActiveGroupIdByWorktree,
          layoutByWorktree: {
            ...s.layoutByWorktree,
            [worktreeId]: s.layoutByWorktree[worktreeId] ?? { type: 'leaf', groupId: group.id }
          },
          activeTabId: shouldActivate ? tab.id : orphanCleanupPatch.activeTabId,
          activeTabIdByWorktree: {
            ...orphanCleanupPatch.activeTabIdByWorktree,
            [worktreeId]: nextActiveTabIdForWorktree
          },
          ptyIdsByTabId: {
            ...orphanCleanupPatch.ptyIdsByTabId,
            [tab.id]: options?.initialPtyId ? [options.initialPtyId] : []
          },
          terminalLayoutsByTabId: {
            ...orphanCleanupPatch.terminalLayoutsByTabId,
            [tab.id]: emptyLayoutSnapshot()
          }
        }
      })
      // Why: the patch above removed the orphan tabs, so their agent rows must be
      // torn down the same way closeTab tears down a closed tab's rows.
      dropOrphanTerminalAgentStatus(get(), worktreeId, sweptOrphanTerminalIds)
      const shouldRecordInteraction =
        options?.recordInteraction ?? (!options?.pendingActivationSpawn && !options?.initialPtyId)
      if (shouldRecordInteraction) {
        get().recordFeatureInteraction?.('terminal-tabs')
      }
      return tab
    }
  }
}
