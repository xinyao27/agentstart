import type { StateCreator } from 'zustand'
import { isClaudeAgent } from '~renderer/agent/title/provider'
import { classifyTitleActivity } from '~renderer/terminal-pane/agent/evidence'
import { recordTerminalInputActivity } from '~renderer/terminal-pane/input-activity-coalescing'

import type { AppState } from '../../store/types'
import type { TerminalSlice } from './slice'

export function createTerminalSessionStateActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<
  TerminalSlice,
  | 'markDefaultTerminalTabsApplied'
  | 'setHydrationSucceeded'
  | 'setRecentQuickCommandForGroup'
  | 'claimAutomaticAgentResume'
  | 'recordTerminalInput'
  | 'setCacheTimerStartedAt'
  | 'seedCacheTimersForIdleTabs'
  | 'setDeferredSshReconnectTargets'
  | 'removeDeferredSshReconnectTarget'
> {
  return {
    markDefaultTerminalTabsApplied: (worktreeId) =>
      set((s) => {
        if (s.defaultTerminalTabsAppliedByWorktreeId[worktreeId]) {
          return {}
        }
        return {
          defaultTerminalTabsAppliedByWorktreeId: {
            ...s.defaultTerminalTabsAppliedByWorktreeId,
            [worktreeId]: true
          }
        }
      }),
    setHydrationSucceeded: (value) => {
      set({ hydrationSucceeded: value })
    },
    setRecentQuickCommandForGroup: (groupId, quickCommandId) => {
      set((s) => ({
        recentQuickCommandIdByGroup: {
          ...s.recentQuickCommandIdByGroup,
          [groupId]: quickCommandId
        }
      }))
    },
    claimAutomaticAgentResume: (tabId, claim) => {
      set((s) => ({
        automaticAgentResumeClaimsByTabId: {
          ...s.automaticAgentResumeClaimsByTabId,
          [tabId]: claim
        }
      }))
    },
    recordTerminalInput: (paneKey, timestamp = Date.now()) => {
      if (!paneKey || !Number.isFinite(timestamp)) {
        return
      }
      recordTerminalInputActivity({
        paneKey,
        timestamp,
        forceWrite: get().lastTerminalInputAtByPaneKey[paneKey] === undefined,
        commit: {
          insert: (key, at) =>
            set((s) => ({
              lastTerminalInputAtByPaneKey: { ...s.lastTerminalInputAtByPaneKey, [key]: at }
            })),
          refreshExisting: (entries) =>
            set((s) => {
              let next: Record<string, number> | null = null
              for (const [key, at] of entries) {
                const current = s.lastTerminalInputAtByPaneKey[key]
                if (current === undefined || current >= at) {
                  continue
                }
                next ??= { ...s.lastTerminalInputAtByPaneKey }
                next[key] = at
              }
              return next ? { lastTerminalInputAtByPaneKey: next } : {}
            })
        }
      })
    },
    setCacheTimerStartedAt: (key, ts) => {
      set((s) => {
        const next = { ...s.cacheTimerByKey, [key]: ts }
        // Why: when a real pane transition writes a key like `${tabId}:${leafId}`,
        // clean up any `${tabId}:seed` sentinel left by seedCacheTimersForIdleTabs.
        // This prevents phantom timers when the seeded key doesn't match the real
        // pane ID (e.g., idle Claude in pane 2 of a split tab).
        const colonIdx = key.indexOf(':')
        if (colonIdx !== -1) {
          const tabId = key.slice(0, colonIdx)
          const suffix = key.slice(colonIdx + 1)
          if (suffix !== 'seed') {
            delete next[`${tabId}:seed`]
          }
        }
        return { cacheTimerByKey: next }
      })
    },
    seedCacheTimersForIdleTabs: () => {
      // Why: when the user enables the cache timer feature mid-session, any Claude
      // tabs that are already idle won't have a timer because the working→idle
      // transition already happened. Scan all tabs and seed timers for idle Claude
      // sessions that don't already have one.
      const s = get()
      const now = Date.now()
      const updates: Record<string, number> = {}
      for (const tabs of Object.values(s.tabsByWorktree)) {
        for (const tab of tabs) {
          if (!tab.title || !isClaudeAgent(tab.title)) {
            continue
          }
          const status = classifyTitleActivity(tab.title)
          if (status === null || status === 'working') {
            continue
          }
          // Why: the store doesn't know which pane holds the idle Claude session,
          // so we use a sentinel suffix. The `setCacheTimerStartedAt` action
          // automatically cleans up `:seed` entries when any real pane transition
          // writes to the same tab, preventing phantom timers.
          const key = `${tab.id}:seed`
          if (s.cacheTimerByKey[key] == null) {
            updates[key] = now
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        set((s) => ({
          cacheTimerByKey: { ...s.cacheTimerByKey, ...updates }
        }))
      }
    },
    setDeferredSshReconnectTargets: (targetIds) => set({ deferredSshReconnectTargets: targetIds }),
    removeDeferredSshReconnectTarget: (targetId) =>
      set((s) => ({
        deferredSshReconnectTargets: s.deferredSshReconnectTargets.filter((id) => id !== targetId)
      }))
  }
}
