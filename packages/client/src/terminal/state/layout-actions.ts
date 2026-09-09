import { makePaneKey } from '@yiru/protocol/terminal/pane-identity'
import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { withTerminalTabPtyId } from './pty-model'
import { uniquePtyIds, resolvePrimaryLayoutPtyId } from './runtime-model'
import type { TerminalSlice } from './slice'

export function createTerminalLayoutActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<
  TerminalSlice,
  | 'consumeSuppressedPtyExit'
  | 'suppressPtyExit'
  | 'queueCodexPaneRestarts'
  | 'consumePendingCodexPaneRestart'
  | 'markCodexRestartNotices'
  | 'clearCodexRestartNotice'
  | 'setTabPaneExpanded'
  | 'setTabCanExpandPane'
  | 'setTabLayout'
  | 'syncPaneDetachPtyOwnership'
> {
  return {
    consumeSuppressedPtyExit: (ptyId) => {
      let wasSuppressed = false
      set((s) => {
        if (!s.suppressedPtyExitIds[ptyId]) {
          return {}
        }
        wasSuppressed = true
        const next = { ...s.suppressedPtyExitIds }
        delete next[ptyId]
        return { suppressedPtyExitIds: next }
      })
      return wasSuppressed
    },
    suppressPtyExit: (ptyId) => {
      set((s) => ({
        suppressedPtyExitIds: { ...s.suppressedPtyExitIds, [ptyId]: true }
      }))
    },
    queueCodexPaneRestarts: (ptyIds) => {
      if (ptyIds.length === 0) {
        return
      }
      set((s) => ({
        pendingCodexPaneRestartIds: {
          ...s.pendingCodexPaneRestartIds,
          ...Object.fromEntries(ptyIds.map((ptyId) => [ptyId, true] as const))
        }
      }))
    },
    consumePendingCodexPaneRestart: (ptyId) => {
      let wasQueued = false
      set((s) => {
        if (!s.pendingCodexPaneRestartIds[ptyId]) {
          return {}
        }
        wasQueued = true
        const next = { ...s.pendingCodexPaneRestartIds }
        delete next[ptyId]
        return { pendingCodexPaneRestartIds: next }
      })
      return wasQueued
    },
    markCodexRestartNotices: (notices) => {
      if (notices.length === 0) {
        return
      }
      set((s) => {
        const next = { ...s.codexRestartNoticeByPtyId }
        const nextPendingCodexPaneRestartIds = { ...s.pendingCodexPaneRestartIds }
        for (const notice of notices) {
          const existing = next[notice.ptyId]
          const previousAccountLabel = existing?.previousAccountLabel ?? notice.previousAccountLabel

          // Why: a live Codex pane stays on the account it originally launched
          // with until that pane actually restarts. Repeated account switches
          // must preserve that original pane account; otherwise A -> B -> A
          // keeps showing a stale restart notice even though the pane never left
          // account A and no longer needs a restart.
          if (previousAccountLabel === notice.nextAccountLabel) {
            delete next[notice.ptyId]
            delete nextPendingCodexPaneRestartIds[notice.ptyId]
            continue
          }

          next[notice.ptyId] = {
            previousAccountLabel,
            nextAccountLabel: notice.nextAccountLabel
          }
        }
        return {
          codexRestartNoticeByPtyId: next,
          pendingCodexPaneRestartIds: nextPendingCodexPaneRestartIds
        }
      })
    },
    clearCodexRestartNotice: (ptyId) => {
      set((s) => {
        if (!s.codexRestartNoticeByPtyId[ptyId]) {
          return {}
        }
        const next = { ...s.codexRestartNoticeByPtyId }
        const nextPendingCodexPaneRestartIds = { ...s.pendingCodexPaneRestartIds }
        delete next[ptyId]
        delete nextPendingCodexPaneRestartIds[ptyId]
        return {
          codexRestartNoticeByPtyId: next,
          pendingCodexPaneRestartIds: nextPendingCodexPaneRestartIds
        }
      })
    },
    setTabPaneExpanded: (tabId, expanded) => {
      set((s) => ({
        expandedPaneByTabId: { ...s.expandedPaneByTabId, [tabId]: expanded }
      }))
    },
    setTabCanExpandPane: (tabId, canExpand) => {
      set((s) => ({
        canExpandPaneByTabId: { ...s.canExpandPaneByTabId, [tabId]: canExpand }
      }))
    },
    setTabLayout: (tabId, layout) => {
      set((s) => {
        const next = { ...s.terminalLayoutsByTabId }
        if (layout) {
          next[tabId] = layout
        } else {
          delete next[tabId]
        }
        return { terminalLayoutsByTabId: next }
      })
    },
    syncPaneDetachPtyOwnership: ({
      detachedLeafId,
      detachedPtyId,
      sourceLayout,
      sourceTabId,
      targetTabId
    }) => {
      const sourcePaneKey = makePaneKey(sourceTabId, detachedLeafId)
      const targetPaneKey = makePaneKey(targetTabId, detachedLeafId)
      set((s) => {
        const layoutSourcePtyIds = uniquePtyIds(Object.values(sourceLayout.ptyIdsByLeafId ?? {}))
        const existingSourcePtyIds = (s.ptyIdsByTabId[sourceTabId] ?? []).filter(
          (ptyId) => ptyId !== detachedPtyId
        )
        const sourcePtyIds =
          layoutSourcePtyIds.length > 0 ? layoutSourcePtyIds : existingSourcePtyIds
        const sourcePrimaryPtyId =
          resolvePrimaryLayoutPtyId(sourceLayout) ?? sourcePtyIds[0] ?? null
        const nextPtyIdsByTabId = {
          ...s.ptyIdsByTabId,
          [sourceTabId]: sourcePtyIds
        }
        if (detachedPtyId) {
          nextPtyIdsByTabId[targetTabId] = uniquePtyIds([
            ...(nextPtyIdsByTabId[targetTabId] ?? []),
            detachedPtyId
          ])
        }

        const nextLastKnownRelayPtyIdByTabId = { ...s.lastKnownRelayPtyIdByTabId }
        if (sourcePrimaryPtyId) {
          nextLastKnownRelayPtyIdByTabId[sourceTabId] = sourcePrimaryPtyId
        } else {
          delete nextLastKnownRelayPtyIdByTabId[sourceTabId]
        }
        if (detachedPtyId) {
          nextLastKnownRelayPtyIdByTabId[targetTabId] = detachedPtyId
        }

        // Why: pane-to-tab detach moves a live PTY without spawning or exiting,
        // so transfer its safe pane-owned identity without activity bumps.
        const sourceTabsByWorktree = withTerminalTabPtyId(
          s.tabsByWorktree,
          sourceTabId,
          sourcePrimaryPtyId
        )
        const nextTabsByWorktree = detachedPtyId
          ? withTerminalTabPtyId(sourceTabsByWorktree, targetTabId, detachedPtyId)
          : sourceTabsByWorktree

        return {
          ptyIdsByTabId: nextPtyIdsByTabId,
          lastKnownRelayPtyIdByTabId: nextLastKnownRelayPtyIdByTabId,
          ...(nextTabsByWorktree !== s.tabsByWorktree ? { tabsByWorktree: nextTabsByWorktree } : {})
        }
      })
      // Why: detach keeps the process and its immutable physical pane key alive;
      // move resume/status authority to the new surface before the source can close.
      get().transferAgentPaneAuthority({
        fromPaneKey: sourcePaneKey,
        toPaneKey: targetPaneKey,
        ptyId: detachedPtyId
      })
    }
  }
}
