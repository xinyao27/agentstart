import type { RefObject } from 'react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  BACKGROUND_MOUNT_TERMINAL_WORKTREE_EVENT,
  type BackgroundMountTerminalWorktreeDetail
} from '~renderer/constants/terminal'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import {
  applyBackgroundMountTabRestriction,
  revealActivationDeferredTabs,
  takeAllPendingBackgroundTerminalWorktreeMounts,
  takePendingBackgroundTerminalWorktreeMount
} from '../terminal/background-terminal-worktree-mount'
import { scheduleBackgroundTerminalWorktreeMeasure } from './background-terminal-worktree-visibility'
import { getResolvedExecutionHostIdForWorktree } from './resolved-worktree-execution-host'
import { anyMountedWorktreeHasLayout as computeAnyMountedWorktreeHasLayout } from './split-group-mount'
import { useTerminalWorktreeActivation } from './use-terminal-worktree-activation'

type WorkspaceSurface = { id: string; path: string }

type TerminalWorktreeMountingArgs = {
  workspaceSurfaces: WorkspaceSurface[]
}

export type TerminalWorktreeMounting = {
  activationDeferredMountTabIdsByWorktree: ReadonlyMap<string, ReadonlySet<string>>
  backgroundMountTabIdsByWorktree: ReadonlyMap<string, ReadonlySet<string>>
  measurableBackgroundWorktreeIds: ReadonlySet<string>
  mountedWorktreeIds: ReadonlySet<string>
  mountedWorktreeIdsRef: RefObject<Set<string>>
  measurableBackgroundWorktreeIdsRef: RefObject<Set<string>>
  backgroundMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  activationDeferredMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  backgroundMountRevision: number
  anyMountedWorktreeHasLayout: boolean
}

type TerminalWorktreeMountSnapshot = {
  activationDeferredMountTabIdsByWorktree: ReadonlyMap<string, ReadonlySet<string>>
  anyMountedWorktreeHasLayout: boolean
  backgroundMountTabIdsByWorktree: ReadonlyMap<string, ReadonlySet<string>>
  backgroundMountRevision: number
  measurableBackgroundWorktreeIds: ReadonlySet<string>
  mountedWorktreeIds: ReadonlySet<string>
}

function readOnlySetEquals(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false
    }
  }
  return true
}

function readOnlyMapOfSetsEquals(
  a: ReadonlyMap<string, ReadonlySet<string>>,
  b: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const [key, value] of a) {
    const other = b.get(key)
    if (!other || !readOnlySetEquals(value, other)) {
      return false
    }
  }
  return true
}

// Why: `backgroundMountRevision` is deliberately excluded — it is the notify
// counter itself, and comparing it would defeat content-aware notification.
function mountSnapshotContentEquals(
  a: TerminalWorktreeMountSnapshot,
  b: TerminalWorktreeMountSnapshot
): boolean {
  return (
    a.anyMountedWorktreeHasLayout === b.anyMountedWorktreeHasLayout &&
    readOnlySetEquals(a.mountedWorktreeIds, b.mountedWorktreeIds) &&
    readOnlySetEquals(a.measurableBackgroundWorktreeIds, b.measurableBackgroundWorktreeIds) &&
    readOnlyMapOfSetsEquals(
      a.activationDeferredMountTabIdsByWorktree,
      b.activationDeferredMountTabIdsByWorktree
    ) &&
    readOnlyMapOfSetsEquals(a.backgroundMountTabIdsByWorktree, b.backgroundMountTabIdsByWorktree)
  )
}

// Why: tracks which worktrees have ever been activated (only visited
// worktrees mount a TerminalPane, preventing mass PTY spawning on session
// restore) and, for the active worktree, which of its tabs a cold activation
// defers mounting for. Cold-parking of *hidden* worktrees is a separate
// concern in `useTerminalColdParking`, which reads the refs this hook
// returns.
export function useTerminalWorktreeMounting({
  workspaceSurfaces
}: TerminalWorktreeMountingArgs): TerminalWorktreeMounting {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const pendingStartupByTabId = useAppStore((s) => s.pendingStartupByTabId)
  const groupsByWorktree = useAppStore((s) => s.groupsByWorktree)
  const layoutByWorktree = useAppStore((s) => s.layoutByWorktree)
  const activeGroupIdByWorktree = useAppStore((s) => s.activeGroupIdByWorktree)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const activeTabIdByWorktree = useAppStore((s) => s.activeTabIdByWorktree)
  const unifiedTabsByWorktree = useAppStore((s) => s.unifiedTabsByWorktree)
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const terminalParkingEnabled = useAppStore((s) => s.settings?.terminalHiddenViewParking !== false)
  const activeWorktreeDeferralHostId = useAppStore((s) =>
    getResolvedExecutionHostIdForWorktree(s, activeWorktreeId)
  )

  // Track which worktrees have been activated during this app session.
  // Only mount TerminalPanes for visited worktrees to prevent mass PTY
  // spawning when restoring a session with many saved worktree tabs.
  const mountedWorktreeIdsRef = useRef(new Set<string>())
  const measurableBackgroundWorktreeIdsRef = useRef(new Set<string>())
  const measurableBackgroundWorktreeTimersRef = useRef(new Map<string, number>())
  // Why: the revision is bumped from a mount-time replay of already-queued
  // background mounts, from the live DOM event listener, and from a
  // setTimeout — none of those are prop/state-driven renders, so the counter
  // is modeled as an external store instead of useState to avoid seeding it
  // from a mount effect.
  const mountSnapshotRef = useRef<TerminalWorktreeMountSnapshot>({
    activationDeferredMountTabIdsByWorktree: new Map(),
    anyMountedWorktreeHasLayout: false,
    backgroundMountTabIdsByWorktree: new Map(),
    backgroundMountRevision: 0,
    measurableBackgroundWorktreeIds: new Set(),
    mountedWorktreeIds: new Set()
  })
  const backgroundMountRevisionListenersRef = useRef(new Set<() => void>())
  const notifyBackgroundMountRevision = useEventCallback((): void => {
    const currentSnapshot = mountSnapshotRef.current
    const candidate = {
      activationDeferredMountTabIdsByWorktree: new Map(
        activationDeferredMountTabIdsByWorktreeRef.current
      ),
      anyMountedWorktreeHasLayout: computeAnyMountedWorktreeHasLayout(
        workspaceSurfaces.map((workspace) => workspace.id),
        mountedWorktreeIdsRef.current,
        layoutByWorktree,
        groupsByWorktree,
        activeGroupIdByWorktree
      ),
      backgroundMountTabIdsByWorktree: new Map(backgroundMountTabIdsByWorktreeRef.current),
      backgroundMountRevision: currentSnapshot.backgroundMountRevision + 1,
      measurableBackgroundWorktreeIds: new Set(measurableBackgroundWorktreeIdsRef.current),
      mountedWorktreeIds: new Set(mountedWorktreeIdsRef.current)
    }
    // Why: the activation effect calls this on every pass and one of its deps
    // (`workspaceSurfaces`) is rebuilt each render. Bumping the revision
    // unconditionally re-renders through useSyncExternalStore, which re-runs
    // the effect and loops into React error #185. Notify only when the tracked
    // content actually changed; the revision itself is not content.
    if (mountSnapshotContentEquals(currentSnapshot, candidate)) {
      return
    }
    mountSnapshotRef.current = candidate
    for (const listener of backgroundMountRevisionListenersRef.current) {
      listener()
    }
  })
  const subscribeToBackgroundMountRevision = (listener: () => void): (() => void) => {
    backgroundMountRevisionListenersRef.current.add(listener)
    return () => {
      backgroundMountRevisionListenersRef.current.delete(listener)
    }
  }
  const getBackgroundMountRevisionSnapshot = (): TerminalWorktreeMountSnapshot =>
    mountSnapshotRef.current
  const mountSnapshot = useSyncExternalStore(
    subscribeToBackgroundMountRevision,
    getBackgroundMountRevisionSnapshot
  )
  // Why: background-mounted worktrees restricted to specific tabs (targeted
  // wake/resume) must not instantiate a TerminalPane per saved tab. A worktree
  // absent from this map mounts all of its tabs.
  const backgroundMountTabIdsByWorktreeRef = useRef(new Map<string, ReadonlySet<string>>())
  // Why: targeted background mounts share the allowed-tab map above, but only
  // cold activation deferral should immediately create watcher coverage for
  // every unmounted tab.
  const activationDeferredMountTabIdsByWorktreeRef = useRef(new Map<string, ReadonlySet<string>>())
  // Why: the cold-activation deferral decision must run once per activation
  // transition, not on every re-render of an already-active worktree.
  const lastActivationWorktreeIdRef = useRef<string | null>(null)

  useEffect(() => {
    const timers = measurableBackgroundWorktreeTimersRef.current
    const applyBackgroundMount = (detail: BackgroundMountTerminalWorktreeDetail): void => {
      const worktreeId = detail.worktreeId
      applyBackgroundMountTabRestriction(
        backgroundMountTabIdsByWorktreeRef.current,
        mountedWorktreeIdsRef.current,
        worktreeId,
        detail.tabIds
      )
      // Why: a targeted wake can reveal a tab that was deferred by an earlier
      // user activation. Remove it from watcher ownership before its pane mounts.
      const worktreeTabIds = (useAppStore.getState().tabsByWorktree[worktreeId] ?? []).map(
        (tab) => tab.id
      )
      revealActivationDeferredTabs({
        restrictions: backgroundMountTabIdsByWorktreeRef.current,
        deferredMountTabIdsByWorktree: activationDeferredMountTabIdsByWorktreeRef.current,
        worktreeId,
        allTabIds: worktreeTabIds,
        immediateTabIds: new Set(detail.tabIds ?? worktreeTabIds)
      })
      scheduleBackgroundTerminalWorktreeMeasure({
        mountedWorktreeIds: mountedWorktreeIdsRef.current,
        measurableBackgroundWorktreeIds: measurableBackgroundWorktreeIdsRef.current,
        timers,
        worktreeId,
        onRevision: notifyBackgroundMountRevision,
        setTimeoutFn: window.setTimeout,
        clearTimeoutFn: window.clearTimeout
      })
    }
    const onBackgroundMountTerminalWorktree = (event: Event): void => {
      const customEvent = event as CustomEvent<BackgroundMountTerminalWorktreeDetail>
      const worktreeId = customEvent.detail?.worktreeId
      const pending = takePendingBackgroundTerminalWorktreeMount(worktreeId)
      const detail = pending ?? customEvent.detail
      if (detail?.worktreeId) {
        applyBackgroundMount(detail)
      }
    }
    window.addEventListener(
      BACKGROUND_MOUNT_TERMINAL_WORKTREE_EVENT,
      onBackgroundMountTerminalWorktree as EventListener
    )
    // Requests made while the lazy Terminal bundle/effect was absent stay in
    // the registry and are replayed only after the listener owns the surface.
    for (const pending of takeAllPendingBackgroundTerminalWorktreeMounts()) {
      applyBackgroundMount(pending)
    }
    return () => {
      window.removeEventListener(
        BACKGROUND_MOUNT_TERMINAL_WORKTREE_EVENT,
        onBackgroundMountTerminalWorktree as EventListener
      )
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [notifyBackgroundMountRevision])

  useTerminalWorktreeActivation({
    activationDeferredMountTabIdsByWorktreeRef,
    activeGroupIdByWorktree,
    activeTabId,
    activeTabIdByWorktree,
    activeWorktreeDeferralHostId,
    activeWorktreeId,
    backgroundMountTabIdsByWorktreeRef,
    groupsByWorktree,
    lastActivationWorktreeIdRef,
    mountedWorktreeIdsRef,
    notifyMountRevision: notifyBackgroundMountRevision,
    pendingStartupByTabId,
    tabsByWorktree,
    terminalParkingEnabled,
    unifiedTabsByWorktree,
    workspaceSessionReady,
    workspaceSurfaces
  })

  const {
    activationDeferredMountTabIdsByWorktree,
    anyMountedWorktreeHasLayout,
    backgroundMountRevision,
    backgroundMountTabIdsByWorktree,
    measurableBackgroundWorktreeIds,
    mountedWorktreeIds
  } = mountSnapshot

  return {
    activationDeferredMountTabIdsByWorktree,
    backgroundMountTabIdsByWorktree,
    measurableBackgroundWorktreeIds,
    mountedWorktreeIds,
    mountedWorktreeIdsRef,
    measurableBackgroundWorktreeIdsRef,
    backgroundMountTabIdsByWorktreeRef,
    activationDeferredMountTabIdsByWorktreeRef,
    backgroundMountRevision,
    anyMountedWorktreeHasLayout
  }
}
