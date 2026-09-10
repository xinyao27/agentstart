import { isRuntimePtyId } from '@agentstart/protocol/terminal-identity'
import type { StateCreator } from 'zustand'
import { hasWorktreeSleepIntent } from '~renderer/sidebar/worktree-sleep-intent'

import type { AppState } from '../../store/types'
import type { TerminalSlice } from './slice'
import { getPendingActivationSpawnCount, consumePendingActivationSpawn } from './tab-model'
import { isTerminalTabPresent } from './tab-retirement'

export function createTerminalPtyOwnershipActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'updateTabPtyId' | 'clearTabPtyId'> {
  return {
    updateTabPtyId: (tabId, ptyId, replacedPtyId) => {
      // Why: async spawn owners must perform provider teardown themselves, but
      // this final guard prevents any late caller from recreating retired tab maps.
      const initialState = get()
      if (!isTerminalTabPresent(initialState, tabId)) {
        return
      }
      let worktreeId: string | null = null
      let wasActivationSpawn = false
      const isRemoteRuntimeMirror = isRuntimePtyId(ptyId)
      set((s) => {
        const existingPtyIds = (s.ptyIdsByTabId[tabId] ?? []).filter(
          (existingPtyId) => existingPtyId !== replacedPtyId
        )
        const nextPtyIds = existingPtyIds.includes(ptyId)
          ? existingPtyIds
          : [...existingPtyIds, ptyId]
        let nextTabsByWorktree = s.tabsByWorktree
        for (const [wId, tabs] of Object.entries(s.tabsByWorktree)) {
          const index = tabs.findIndex((t) => t.id === tabId)
          if (index === -1) {
            continue
          }
          worktreeId = wId
          const tab = tabs[index]
          if (getPendingActivationSpawnCount(tab.pendingActivationSpawn) > 0) {
            wasActivationSpawn = true
          }
          // Why: consume one pendingActivationSpawn unit here. Split layouts can
          // remount several panes for one click, and each pane's activation-time
          // PTY callback must be suppressed without hiding later real activity.
          const { pendingActivationSpawn: _unused, ...rest } = tab
          void _unused
          // Why: tab.ptyId is the single-pane fallback used by attach
          // paths. In split panes, later pane spawns must not steal that
          // primary binding from the original pane or remount/close flows can
          // reattach the tab to the wrong PTY and appear to "reset" panes.
          const nextTabPtyId = tab.ptyId ?? nextPtyIds[0] ?? null
          const nextPendingActivationSpawn = consumePendingActivationSpawn(
            tab.pendingActivationSpawn
          )
          if (tab.pendingActivationSpawn || tab.ptyId !== nextTabPtyId) {
            const nextTabs = [...tabs]
            nextTabs[index] = {
              ...rest,
              ...(nextPendingActivationSpawn
                ? { pendingActivationSpawn: nextPendingActivationSpawn }
                : {}),
              ptyId: nextTabPtyId
            }
            nextTabsByWorktree = { ...s.tabsByWorktree, [wId]: nextTabs }
          }
          break
        }
        // Why: when a brand-new tab in the active worktree receives its first
        // PTY, the live-tab signal (+12) flips on. Normally we bump sortEpoch
        // here so the sort reflects the new signal immediately. Suppress the
        // bump on activation-driven spawns because they are side-effects of the
        // user clicking on a worktree, not real activity — otherwise clicking a
        // dormant worktree would always trigger a re-sort.
        const isFirstPty = existingPtyIds.length === 0
        const isActiveWorktree = worktreeId != null && s.activeWorktreeId === worktreeId
        const shouldBumpSortEpoch = isFirstPty && isActiveWorktree && !wasActivationSpawn
        const nextSuppressedPtyExitIds = { ...s.suppressedPtyExitIds }
        delete nextSuppressedPtyExitIds[ptyId]
        return {
          ...(nextTabsByWorktree !== s.tabsByWorktree
            ? { tabsByWorktree: nextTabsByWorktree }
            : {}),
          ptyIdsByTabId: {
            ...s.ptyIdsByTabId,
            [tabId]: nextPtyIds
          },
          lastKnownRelayPtyIdByTabId: {
            ...s.lastKnownRelayPtyIdByTabId,
            [tabId]: ptyId
          },
          suppressedPtyExitIds: nextSuppressedPtyExitIds,
          ...(shouldBumpSortEpoch ? { sortEpoch: s.sortEpoch + 1 } : {})
        }
      })

      // Why: activation-driven spawns are caused by the user clicking a
      // worktree, not by work happening in it. Skip both the lastActivityAt
      // stamp and the sortEpoch bump so the sidebar does not reorder on click.
      // Other spawn reasons (new tab, codex restart, reconnect) still flow
      // through bumpWorktreeActivity as a normal activity signal.
      if (worktreeId && !wasActivationSpawn && !isRemoteRuntimeMirror) {
        get().bumpWorktreeActivity(worktreeId)
      }
    },
    clearTabPtyId: (tabId, ptyId) => {
      let worktreeId: string | null = null
      let wasActivationSpawn = false
      let isRemoteRuntimeMirror = isRuntimePtyId(ptyId)
      set((s) => {
        const existingPtyIds = s.ptyIdsByTabId[tabId] ?? []
        const remainingPtyIds = ptyId ? existingPtyIds.filter((id) => id !== ptyId) : []
        let nextTabsByWorktree = s.tabsByWorktree
        for (const [wId, tabs] of Object.entries(s.tabsByWorktree)) {
          const index = tabs.findIndex((t) => t.id === tabId)
          if (index === -1) {
            continue
          }
          worktreeId = wId
          const tab = tabs[index]
          if (getPendingActivationSpawnCount(tab.pendingActivationSpawn) > 0) {
            wasActivationSpawn = true
          }
          if (!ptyId) {
            isRemoteRuntimeMirror =
              existingPtyIds.length > 0 && existingPtyIds.every((id) => isRuntimePtyId(id))
          }
          // Why: consume pendingActivationSpawn for real activation-time clears,
          // but keep it when clearing a stale wake-hint id that was not live in
          // ptyIdsByTabId. That path immediately falls back to a fresh spawn,
          // and the spawn still needs the click-driven suppression.
          const { pendingActivationSpawn: _unused, ...rest } = tab
          void _unused
          const nextTabPtyId = remainingPtyIds.at(-1) ?? null
          const shouldRetainActivationSpawn =
            wasActivationSpawn && ptyId != null && !existingPtyIds.includes(ptyId)
          const nextPendingActivationSpawn = shouldRetainActivationSpawn
            ? tab.pendingActivationSpawn
            : consumePendingActivationSpawn(tab.pendingActivationSpawn)
          if (tab.pendingActivationSpawn || tab.ptyId !== nextTabPtyId) {
            const nextTabs = [...tabs]
            nextTabs[index] = {
              ...rest,
              ...(nextPendingActivationSpawn
                ? { pendingActivationSpawn: nextPendingActivationSpawn }
                : {}),
              ptyId: nextTabPtyId
            }
            nextTabsByWorktree = { ...s.tabsByWorktree, [wId]: nextTabs }
          }
          break
        }
        const nextPtyIdsByTabId = { ...s.ptyIdsByTabId }
        if (worktreeId) {
          nextPtyIdsByTabId[tabId] = remainingPtyIds
        } else {
          // Why: repo purge can remove the owning tab before its asynchronous
          // exit arrives. Do not resurrect an orphan PTY index for a retired tab.
          delete nextPtyIdsByTabId[tabId]
        }
        const nextPendingCodexPaneRestartIds = { ...s.pendingCodexPaneRestartIds }
        const nextCodexRestartNoticeByPtyId = { ...s.codexRestartNoticeByPtyId }
        if (ptyId) {
          delete nextPendingCodexPaneRestartIds[ptyId]
          delete nextCodexRestartNoticeByPtyId[ptyId]
        } else {
          for (const currentPtyId of s.ptyIdsByTabId[tabId] ?? []) {
            delete nextPendingCodexPaneRestartIds[currentPtyId]
            delete nextCodexRestartNoticeByPtyId[currentPtyId]
          }
        }
        // Why: when a specific ptyId is passed, the PTY actually exited (not
        // just disconnected). Remove its lastKnown entry so session-save does
        // not attempt to reattach a dead relay PTY on next restart. When no
        // ptyId is passed (bulk clear on connection_lost), preserve lastKnown
        // because the relay still has the PTY alive during its grace period.
        const nextLastKnownRelay = { ...s.lastKnownRelayPtyIdByTabId }
        if (ptyId && nextLastKnownRelay[tabId] === ptyId) {
          delete nextLastKnownRelay[tabId]
        }
        return {
          ...(nextTabsByWorktree !== s.tabsByWorktree
            ? { tabsByWorktree: nextTabsByWorktree }
            : {}),
          ptyIdsByTabId: nextPtyIdsByTabId,
          lastKnownRelayPtyIdByTabId: nextLastKnownRelay,
          pendingCodexPaneRestartIds: nextPendingCodexPaneRestartIds,
          codexRestartNoticeByPtyId: nextCodexRestartNoticeByPtyId
        }
      })

      // Bump meaningful activity when a PTY exits, but skip if this exit
      // was triggered by an intentional shutdown (suppressed exits) OR by a
      // click-driven pane unmount (pendingActivationSpawn).
      if (
        worktreeId &&
        !wasActivationSpawn &&
        !isRemoteRuntimeMirror &&
        !hasWorktreeSleepIntent(worktreeId) &&
        !(ptyId && get().suppressedPtyExitIds[ptyId])
      ) {
        get().bumpWorktreeActivity(worktreeId)
      }
    }
  }
}
