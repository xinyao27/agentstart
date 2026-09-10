import type { TabGroupLayoutNode } from '@agentstart/protocol/workspace/tabs'
import type { RefObject } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'

import { getTerminalWorktreeColdParkRecheckDelayMs } from '../terminal-pane/cold-park-deadlines'
import { selectEvictionExemptTerminalTabIds } from '../terminal-pane/eviction-exempt-tabs'
import {
  selectColdParkedTerminalWorktrees,
  TERMINAL_WORKTREE_COLD_PARK_DELAY_MS,
  type TerminalWorktreeColdParkCandidate
} from '../terminal-pane/terminal-hidden-view-parking'
import { warnTerminalLifecycleAnomaly } from '../terminal-pane/terminal-lifecycle-diagnostics'
import { canWatcherCoverParkedTerminalTab } from '../terminal-pane/terminal-parked-tab-watchers'
import {
  captureRetentionForceParkedWorktreeBuffers,
  selectRetentionForceParkedTerminalWorktrees,
  TERMINAL_HIDDEN_WORKTREE_RETENTION_TTL_MS
} from './hidden-retention'
import { useLegacyColdParkingWatchers } from './legacy-cold-parking-watchers'
import { haveSameWorktreeIds } from './tab-model-lookup'

type WorkspaceSurface = { id: string; path: string }

type TerminalColdParkingArgs = {
  workspaceSurfaces: WorkspaceSurface[]
  mountedWorktreeIdsRef: RefObject<Set<string>>
  measurableBackgroundWorktreeIdsRef: RefObject<Set<string>>
  activationDeferredMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  backgroundMountRevision: number
  anyMountedWorktreeHasLayout: boolean
  getEffectiveLayoutForWorktree: (worktreeId: string) => TabGroupLayoutNode | undefined
}

type TerminalColdParkingSnapshot = {
  parkedTerminalWorktreeIds: ReadonlySet<string>
  forceParkedTerminalWorktreeIds: ReadonlySet<string>
}

// Why: worktree-level cold-park policy for *hidden* worktrees — hiddenSince
// bookkeeping, parked-set selection, and byte-watcher reconciliation for the
// legacy (non-split) terminal host. Split-mode watchers are owned per
// TerminalPaneOverlayLayer; this hook only disposes/parks worktrees that
// render no overlay layer.
export function useTerminalColdParking({
  workspaceSurfaces,
  mountedWorktreeIdsRef,
  measurableBackgroundWorktreeIdsRef,
  activationDeferredMountTabIdsByWorktreeRef,
  backgroundMountRevision,
  anyMountedWorktreeHasLayout,
  getEffectiveLayoutForWorktree
}: TerminalColdParkingArgs): TerminalColdParkingSnapshot {
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const pendingStartupByTabId = useAppStore((s) => s.pendingStartupByTabId)
  const terminalParkingEnabled = useAppStore((s) => s.settings?.terminalHiddenViewParking !== false)
  const terminalSshParkingEnabled = useAppStore((s) => s.settings?.terminalSshViewParking !== false)
  const retentionBudgetEnabled = useAppStore(
    (s) => s.settings?.terminalHiddenWorktreeRetentionBudget !== false
  )
  const { repos } = useProjectCatalog()

  const terminalWorktreeHiddenSinceRef = useRef(new Map<string, number>())
  const measuringTerminalWorktreeIdsRef = useRef(new Set<string>())
  const terminalWorktreeParkCooldownUntilRef = useRef(new Map<string, number>())
  const terminalWorktreeParkingTimersRef = useRef(new Map<string, number>())
  const forceParkedCaptureDoneRef = useRef(new Set<string>())
  const [terminalParkingRevision, setTerminalParkingRevision] = useState(0)
  // Why: the parked-id set is published from a timer-driven reconciliation
  // effect, not from a prop/state change, so it is modeled as an external
  // store instead of useState — publishing it from the effect would otherwise
  // read as seeding state from an effect on every recheck.
  const terminalColdParkingSnapshotRef = useRef<TerminalColdParkingSnapshot>({
    parkedTerminalWorktreeIds: new Set(),
    forceParkedTerminalWorktreeIds: new Set()
  })
  const parkedTerminalWorktreeIdsListenersRef = useRef(new Set<() => void>())
  const subscribeToParkedTerminalWorktreeIds = (listener: () => void): (() => void) => {
    parkedTerminalWorktreeIdsListenersRef.current.add(listener)
    return () => {
      parkedTerminalWorktreeIdsListenersRef.current.delete(listener)
    }
  }
  const getParkedTerminalWorktreeIdsSnapshot = (): TerminalColdParkingSnapshot =>
    terminalColdParkingSnapshotRef.current
  const terminalColdParkingSnapshot = useSyncExternalStore(
    subscribeToParkedTerminalWorktreeIds,
    getParkedTerminalWorktreeIdsSnapshot
  )
  const { parkedTerminalWorktreeIds, forceParkedTerminalWorktreeIds } = terminalColdParkingSnapshot

  useEffect(() => {
    const timers = terminalWorktreeParkingTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  // Why: worktree-level cold-park policy — hiddenSince bookkeeping, parked-set
  // selection, and one recheck timer per still-pending deadline so React
  // re-renders exactly when the hysteresis elapses instead of polling.
  useEffect(() => {
    const parkingTimers = terminalWorktreeParkingTimersRef.current
    for (const timer of parkingTimers.values()) {
      window.clearTimeout(timer)
    }
    parkingTimers.clear()

    const nowMs = Date.now()
    const currentWorktreeIds = new Set(workspaceSurfaces.map((workspace) => workspace.id))
    for (const worktreeId of Array.from(terminalWorktreeHiddenSinceRef.current.keys())) {
      if (!currentWorktreeIds.has(worktreeId) || !mountedWorktreeIdsRef.current.has(worktreeId)) {
        terminalWorktreeHiddenSinceRef.current.delete(worktreeId)
        measuringTerminalWorktreeIdsRef.current.delete(worktreeId)
        terminalWorktreeParkCooldownUntilRef.current.delete(worktreeId)
      }
    }

    const retentionCandidates: TerminalWorktreeColdParkCandidate[] = []
    for (const workspace of workspaceSurfaces) {
      const worktreeId = workspace.id
      if (!mountedWorktreeIdsRef.current.has(worktreeId)) {
        terminalWorktreeHiddenSinceRef.current.delete(worktreeId)
        measuringTerminalWorktreeIdsRef.current.delete(worktreeId)
        terminalWorktreeParkCooldownUntilRef.current.delete(worktreeId)
        continue
      }
      const isVisible = activeView === 'terminal' && activeWorktreeId === worktreeId
      const shouldMeasureHiddenWorktree =
        !isVisible && measurableBackgroundWorktreeIdsRef.current.has(worktreeId)
      if (shouldMeasureHiddenWorktree) {
        measuringTerminalWorktreeIdsRef.current.add(worktreeId)
      } else {
        if (measuringTerminalWorktreeIdsRef.current.delete(worktreeId)) {
          terminalWorktreeParkCooldownUntilRef.current.set(
            worktreeId,
            nowMs + TERMINAL_WORKTREE_COLD_PARK_DELAY_MS
          )
        }
      }
      if (isVisible) {
        terminalWorktreeHiddenSinceRef.current.delete(worktreeId)
        terminalWorktreeParkCooldownUntilRef.current.delete(worktreeId)
      } else if (
        !shouldMeasureHiddenWorktree &&
        !terminalWorktreeHiddenSinceRef.current.has(worktreeId)
      ) {
        terminalWorktreeHiddenSinceRef.current.set(worktreeId, nowMs)
      }

      retentionCandidates.push({
        worktreeId,
        terminalTabs: tabsByWorktree[worktreeId] ?? [],
        isVisible,
        shouldMeasureHiddenWorktree,
        hiddenSinceMs: terminalWorktreeHiddenSinceRef.current.get(worktreeId) ?? null,
        parkCooldownUntilMs: terminalWorktreeParkCooldownUntilRef.current.get(worktreeId) ?? null
      })
    }

    const nextParkedTerminalWorktreeIds = selectColdParkedTerminalWorktrees({
      worktrees: retentionCandidates,
      pendingStartupByTabId,
      parkingEnabled: terminalParkingEnabled,
      nowMs,
      restorePolicy: { sshParkingEnabled: terminalSshParkingEnabled }
    })
    // Why: a worktree with any tab the byte watchers cannot cover (no
    // capture, no layout snapshot, legacy leaf ids) must never park — it
    // would go silent for bells/titles/completions, the failure that sank
    // the first parking attempt.
    for (const worktreeId of Array.from(nextParkedTerminalWorktreeIds)) {
      const tabs = tabsByWorktree[worktreeId] ?? []
      if (!tabs.every((tab) => canWatcherCoverParkedTerminalTab(worktreeId, tab))) {
        nextParkedTerminalWorktreeIds.delete(worktreeId)
      }
    }
    const nextForceParkedTerminalWorktreeIds = selectRetentionForceParkedTerminalWorktrees({
      worktrees: retentionCandidates.map((candidate) => ({
        ...candidate,
        ordinaryParkingCovers: nextParkedTerminalWorktreeIds.has(candidate.worktreeId)
      })),
      pendingStartupByTabId,
      parkingEnabled: terminalParkingEnabled,
      retentionBudgetEnabled,
      nowMs
    })
    for (const worktreeId of Array.from(forceParkedCaptureDoneRef.current)) {
      if (!nextForceParkedTerminalWorktreeIds.has(worktreeId)) {
        forceParkedCaptureDoneRef.current.delete(worktreeId)
      }
    }
    for (const worktreeId of nextForceParkedTerminalWorktreeIds) {
      if (!forceParkedCaptureDoneRef.current.has(worktreeId)) {
        const tabs = tabsByWorktree[worktreeId] ?? []
        const exemptTabIds = selectEvictionExemptTerminalTabIds(worktreeId, tabs)
        const evictableTabIds = tabs.filter((tab) => !exemptTabIds.has(tab.id)).map((tab) => tab.id)
        if (evictableTabIds.length === 0 && tabs.length > 0) {
          warnTerminalLifecycleAnomaly('retention force-park freed no panes', {
            worktreeId,
            reason: `exemptTabs=${tabs.length}`
          })
        }
        if (
          captureRetentionForceParkedWorktreeBuffers({
            worktreeId,
            tabIds: evictableTabIds,
            repos
          })
        ) {
          forceParkedCaptureDoneRef.current.add(worktreeId)
        }
      }
      nextParkedTerminalWorktreeIds.add(worktreeId)
    }
    const previousSnapshot = terminalColdParkingSnapshotRef.current
    if (
      !haveSameWorktreeIds(
        previousSnapshot.parkedTerminalWorktreeIds,
        nextParkedTerminalWorktreeIds
      ) ||
      !haveSameWorktreeIds(
        previousSnapshot.forceParkedTerminalWorktreeIds,
        nextForceParkedTerminalWorktreeIds
      )
    ) {
      terminalColdParkingSnapshotRef.current = {
        parkedTerminalWorktreeIds: nextParkedTerminalWorktreeIds,
        forceParkedTerminalWorktreeIds: nextForceParkedTerminalWorktreeIds
      }
      for (const listener of parkedTerminalWorktreeIdsListenersRef.current) {
        listener()
      }
    }

    for (const candidate of retentionCandidates) {
      if (
        candidate.isVisible ||
        candidate.shouldMeasureHiddenWorktree ||
        nextParkedTerminalWorktreeIds.has(candidate.worktreeId)
      ) {
        continue
      }
      const delayMs = getTerminalWorktreeColdParkRecheckDelayMs({
        parkingEnabled: terminalParkingEnabled,
        hiddenSinceMs: candidate.hiddenSinceMs,
        nowMs,
        retentionTtlMs: TERMINAL_HIDDEN_WORKTREE_RETENTION_TTL_MS,
        parkCooldownUntilMs: candidate.parkCooldownUntilMs
      })
      if (delayMs !== null && delayMs > 0) {
        const worktreeId = candidate.worktreeId
        const timer = window.setTimeout(() => {
          parkingTimers.delete(worktreeId)
          setTerminalParkingRevision((revision) => revision + 1)
        }, delayMs)
        parkingTimers.set(worktreeId, timer)
      }
    }
  }, [
    activeView,
    activeWorktreeId,
    backgroundMountRevision,
    measurableBackgroundWorktreeIdsRef,
    mountedWorktreeIdsRef,
    pendingStartupByTabId,
    repos,
    retentionBudgetEnabled,
    tabsByWorktree,
    terminalParkingEnabled,
    terminalSshParkingEnabled,
    terminalParkingRevision,
    workspaceSurfaces
  ])

  useLegacyColdParkingWatchers({
    workspaceSurfaces,
    mountedWorktreeIdsRef,
    measurableBackgroundWorktreeIdsRef,
    activationDeferredMountTabIdsByWorktreeRef,
    backgroundMountRevision,
    anyMountedWorktreeHasLayout,
    getEffectiveLayoutForWorktree,
    parkedTerminalWorktreeIds,
    forceParkedTerminalWorktreeIds
  })

  return { parkedTerminalWorktreeIds, forceParkedTerminalWorktreeIds }
}
