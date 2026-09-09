import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/protocol/host/identity'
import { isFolderRepo } from '@yiru/protocol/project/repository'
import { ORPHAN_WORKTREE_ID } from '@yiru/protocol/terminal/session-identity'
import { isWorkspaceOldForCleanup } from '@yiru/protocol/workspace/cleanup-policy'
import React, { useEffect, useState } from 'react'
import { useNow } from '~renderer/dashboard/use-now'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { listRuntimeTerminalSessions } from '~renderer/runtime/terminal-inspection'
import { useAppStore } from '~renderer/store/state'
import { activateTabAndFocusPane } from '~renderer/tab-bar/activate-and-focus-pane'
import { Popover, PopoverContent } from '~renderer/ui/popover'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { useDaemonActions, DaemonActionDialog } from '../daemon-actions/use-actions'
import { runWorktreeDelete } from '../sidebar/delete-worktree/flow'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './context-menu-policy'
import { mergeSnapshotAndSessions, UNATTRIBUTED_REPO_ID } from './merge-snapshot-and-sessions'
import { ResourceManagerSummary } from './resource-manager-summary'
import {
  getResourceManagerAriaLabel,
  getResourceManagerTooltipLines
} from './resource-manager-terminal-copy'
import { ResourceManagerTree } from './resource-manager-tree'
import { countUnboundDaemonSessions } from './resource-session-bindings'
import { createClosedResourceSessionCountSelector } from './resource-session-count-selector'
import { ResourceSessionKillDialog } from './resource-session-kill-dialog'
import { navigateResourceSessionToTab } from './resource-session-navigation'
import type { DaemonSession } from './resource-usage-merge-types'
import { formatMemory, type SortOption } from './resource-usage-metrics'
import {
  getResourceUsageBrowserTabsByWorktree,
  getResourceUsagePtyIdsByTabId,
  getResourceUsageRuntimePaneTitlesByTabId,
  getResourceUsageTerminalLayoutsByTabId,
  getResourceUsageTabsByWorktree
} from './resource-usage-open-slices'
import {
  resolveResourceUsageSpaceScanReady,
  type ResourceUsageSpaceScanSnapshot
} from './resource-usage-space-scan-ready'
import { ResourceUsageTrigger } from './resource-usage-trigger'
import { useResourceSessionKill } from './use-resource-session-kill'
import { WorkspaceSpaceCompactPanel } from './workspace-space-compact-panel'

const POLL_MS = 2_000
const selectClosedResourceSessionCount = createClosedResourceSessionCountSelector()

export function ResourceUsageStatusSegment({
  iconOnly
}: {
  compact?: boolean
  iconOnly: boolean
}): React.JSX.Element {
  const snapshot = useAppStore((s) => s.memorySnapshot)
  const memorySnapshotError = useAppStore((s) => s.memorySnapshotError)
  const fetchSnapshot = useAppStore((s) => s.fetchMemorySnapshot)
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const closedSessionCount = useAppStore(selectClosedResourceSessionCount)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const openModal = useAppStore((s) => s.openModal)
  const openSpacePage = useAppStore((s) => s.openSpacePage)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const workspaceSpaceScannedAt = useAppStore((s) => s.workspaceSpaceAnalysis?.scannedAt ?? null)
  const workspaceSpaceScanning = useAppStore((s) => s.workspaceSpaceScanning)
  const catalog = useProjectCatalog()

  const [open, setOpen] = useState(false)
  const [sortOption, setSortOption] = useState<SortOption>('memory')
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set())
  const [collapsedWorktrees, setCollapsedWorktrees] = useState<Set<string>>(new Set())
  const [appCollapsed, setAppCollapsed] = useState(true)
  const [sessions, setSessions] = useState<DaemonSession[]>([])
  const [sessionsError, setSessionsError] = useState(false)
  const [spaceScanSnapshot, setSpaceScanSnapshot] = useState<ResourceUsageSpaceScanSnapshot>(
    () => ({
      ready: false,
      previousScanning: workspaceSpaceScanning,
      lastSeenScannedAt: workspaceSpaceScannedAt
    })
  )
  const cleanupReferenceTime = useNow(60_000)
  // Why: tab titles can update on terminal keystrokes. The resource popover's
  // merged tree needs them only while open, so closed status-bar badges should
  // not subscribe to those high-churn maps.
  const runtimePaneTitlesByTabId = useAppStore((s) =>
    getResourceUsageRuntimePaneTitlesByTabId(s, open)
  )
  const repos = open ? catalog.repos : []
  const allWorktrees = open ? catalog.allWorktrees : []
  const tabsByWorktree = useAppStore((s) => getResourceUsageTabsByWorktree(s, open))
  const browserTabsByWorktree = useAppStore((s) => getResourceUsageBrowserTabsByWorktree(s, open))
  // Why: the closed trigger owns a scalar selector. Full binding maps stay
  // behind open sentinels so unchanged counts do not rerender the segment.
  const ptyIdsByTabId = useAppStore((s) => getResourceUsagePtyIdsByTabId(s, open))
  const terminalLayoutsByTabId = useAppStore((s) => getResourceUsageTerminalLayoutsByTabId(s, open))
  const resourceSnapshot = snapshot
  // Why: ptyIdsByTabId intentionally tracks mounted/live panes only. Resource
  // Manager also reads restored wake hints, but only for classification.
  const resourceSessionBindings = (() => ({
    ptyIdsByTabId,
    tabsByWorktree,
    terminalLayoutsByTabId,
    workspaceSessionReady
  }))()

  const mountedRef = useMountedRef()

  const refreshSessions = useEventCallback(async () => {
    try {
      const result = await listRuntimeTerminalSessions()
      if (!mountedRef.current) {
        return
      }
      setSessions(
        result.sessions.map((session) => ({
          id: session.sessionId,
          cwd: session.cwd ?? '',
          title: session.cwd ?? session.sessionId
        }))
      )
      setSessionsError(false)
    } catch {
      if (mountedRef.current) {
        setSessionsError(true)
      }
    }
  })

  const daemonActions = useDaemonActions({
    onRestartSettled: () => {
      setSessionsError(false)
      void fetchSnapshot()
      void refreshSessions()
    },
    onKillAllSettled: () => {
      void refreshSessions()
    }
  })
  const sessionKill = useResourceSessionKill({
    sessions,
    setSessions,
    bindings: resourceSessionBindings,
    refreshSessions
  })

  // Why: Space scans can finish after the user backs out of the full page or
  // closes this popover; the status-bar trigger becomes the handoff point.
  const nextSpaceScanSnapshot = resolveResourceUsageSpaceScanReady({
    snapshot: spaceScanSnapshot,
    open,
    activeView,
    scannedAt: workspaceSpaceScannedAt,
    scanning: workspaceSpaceScanning
  })
  if (
    nextSpaceScanSnapshot.ready !== spaceScanSnapshot.ready ||
    nextSpaceScanSnapshot.previousScanning !== spaceScanSnapshot.previousScanning ||
    nextSpaceScanSnapshot.lastSeenScannedAt !== spaceScanSnapshot.lastSeenScannedAt
  ) {
    // Why: keep the scan transition render-time without mutating refs during
    // render; React can safely retry this guarded state update before commit.
    setSpaceScanSnapshot(nextSpaceScanSnapshot)
  }
  const spaceScanReady = nextSpaceScanSnapshot.ready

  // Poll memory when popover is open. Sessions are refreshed on open and after
  // session actions; a closed status-bar badge must not globally inventory
  // daemon PTYs because large preserved-session sets make that visible while
  // typing.
  useEffect(() => {
    if (!open) {
      return
    }
    void fetchSnapshot()
    void refreshSessions()
    // Why: only the memory snapshot keeps an interval while the popover is
    // open. Session inventory is explicit-on-open/action because it can be
    // expensive with many daemon-preserved terminals.
    const memTimer = window.setInterval(() => {
      void fetchSnapshot()
    }, POLL_MS)
    return () => {
      window.clearInterval(memTimer)
    }
  }, [open, fetchSnapshot, refreshSessions])

  const repoDisplayNameById = (() => {
    const map = new Map<string, string>()
    for (const repo of repos) {
      const display = repo.displayName?.trim()
      if (display) {
        map.set(repo.id, display)
      }
    }
    return map
  })()

  // Why: runtime-hosted repos never have local daemon samples or killable
  // local sessions; this map drives their per-row exclusion in the merge.
  const repoRuntimeScopedById = (() => {
    const map = new Map<string, boolean>()
    for (const repo of repos) {
      const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
      map.set(repo.id, parsed?.kind === 'runtime')
    }
    return map
  })()

  const repoById = (() => new Map(repos.map((repo) => [repo.id, repo])))()
  const worktreeById = (() => new Map(allWorktrees.map((worktree) => [worktree.id, worktree])))()

  const oldWorkspaceCount = (() => {
    let count = 0
    for (const worktree of allWorktrees) {
      const repo = repoById.get(worktree.repoId)
      if (!repo || isFolderRepo(repo) || worktree.isMainWorktree) {
        continue
      }
      if (isWorkspaceOldForCleanup(worktree, cleanupReferenceTime)) {
        count += 1
      }
    }
    return count
  })()

  // Why: skip the merge entirely when the popover is closed. The merged
  // tree is only ever displayed inside <PopoverContent>; computing it on
  // every store mutation (e.g. runtimePaneTitlesByTabId, which changes on
  // every keystroke in any open terminal pane) was making the whole app
  // feel laggy because the segment is always mounted in the status bar.
  const unifiedRepos = (() =>
    open
      ? mergeSnapshotAndSessions(resourceSnapshot, sessions, {
          tabsByWorktree,
          ptyIdsByTabId,
          terminalLayoutsByTabId,
          runtimePaneTitlesByTabId,
          workspaceSessionReady,
          repoDisplayNameById,
          repoRuntimeScopedById,
          browserTabsByWorktree,
          worktreeById
        })
      : [])()

  // Why: orphan detection needs daemon inventory. Keep it open-only so the
  // closed badge never reintroduces a background global session scan.
  const orphanCount = (() => {
    if (!open || !workspaceSessionReady) {
      return 0
    }
    return countUnboundDaemonSessions(sessions, resourceSessionBindings)
  })()

  const triggerSessionCount = open ? sessions.length : closedSessionCount

  const { totalMemory, totalCpu, hostShare, memBadgeLabel } = (() => {
    const memory = resourceSnapshot?.totalMemory ?? 0
    const cpu = resourceSnapshot?.totalCpu ?? 0
    const hostTotal = resourceSnapshot?.host.totalMemory ?? 0
    return {
      totalMemory: memory,
      totalCpu: cpu,
      hostShare: hostTotal > 0 ? (memory / hostTotal) * 100 : 0,
      memBadgeLabel: resourceSnapshot ? formatMemory(memory) : '—'
    }
  })()

  // Why: memorySnapshotError is null both for "last fetch succeeded" and
  // "never fetched". If session refresh fails before a memory snapshot exists,
  // treat that as daemon-unreachable too.
  const daemonUnreachable = sessionsError && (memorySnapshotError !== null || snapshot === null)
  // Why: a partial failure where the sessions IPC fails but the snapshot
  // IPC still works was silently invisible after the merge — the old
  // SessionsTabPanel surfaced it as "Terminal sessions unavailable". Show
  // a slim inline notice so the user understands why the session list is
  // empty/stale even though the resource numbers look fine.
  const sessionsOnlyError = sessionsError && memorySnapshotError === null
  const resourceManagerTooltipLines = getResourceManagerTooltipLines({
    memoryLabel: memBadgeLabel,
    sessionCount: triggerSessionCount,
    spaceScanReady
  })
  const resourceManagerAriaLabel = getResourceManagerAriaLabel({
    sessionCount: triggerSessionCount,
    spaceScanReady
  })

  const toggleRepo = (repoId: string): void => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(repoId)) {
        next.delete(repoId)
      } else {
        next.add(repoId)
      }
      return next
    })
  }

  const toggleWorktree = (worktreeId: string): void => {
    setCollapsedWorktrees((prev) => {
      const next = new Set(prev)
      if (next.has(worktreeId)) {
        next.delete(worktreeId)
      } else {
        next.add(worktreeId)
      }
      return next
    })
  }

  // Why: worktree navigation leaves the popover open so users can browse the
  // tree without reopening it; bound terminal rows close explicitly because
  // focus transfer is intentionally suppressed by onFocusOutside below.
  const navigateToWorktree = (worktreeId: string): void => {
    if (worktreeId === ORPHAN_WORKTREE_ID || worktreeId.startsWith(`${UNATTRIBUTED_REPO_ID}::`)) {
      return
    }
    activateAndRevealWorktree(worktreeId)
  }

  const navigateToTab = (tabId: string, paneKey: string | null) => {
    navigateResourceSessionToTab(tabId, paneKey, {
      tabsByWorktree,
      setOpen,
      setActiveView,
      activateAndRevealWorktree,
      activateTabAndFocusPane
    })
  }

  const deleteWorktree = (worktreeId: string): void => {
    setOpen(false)
    runWorktreeDelete(worktreeId)
  }

  const handleOpenWorkspaceCleanup = (): void => {
    setOpen(false)
    queueMicrotask(() => openModal('workspace-cleanup'))
  }

  const openSpaceResults = (): void => {
    setOpen(false)
    openSpacePage()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        // Why: terminal focus is an intentional navigation result, not a popover dismissal.
        if (!nextOpen && eventDetails.reason === 'focus-out') {
          eventDetails.cancel()
          return
        }
        if (nextOpen) {
          recordFeatureInteraction('resource-manager')
        }
        setOpen(nextOpen)
      }}
    >
      <ResourceUsageTrigger
        iconOnly={iconOnly}
        memoryLabel={memBadgeLabel}
        sessionCount={triggerSessionCount}
        orphanCount={orphanCount}
        isDaemonUnreachable={daemonUnreachable}
        isSpaceScanReady={spaceScanReady}
        ariaLabel={resourceManagerAriaLabel}
        tooltipLines={resourceManagerTooltipLines}
      />
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        className="w-[26rem] max-w-[calc(100vw-2rem)] p-0"
        initialFocus={false}
      >
        <ResourceManagerSummary
          daemonActions={daemonActions}
          isDaemonUnreachable={daemonUnreachable}
          hasSessionsError={sessionsOnlyError}
          snapshot={resourceSnapshot}
          totalCpu={totalCpu}
          totalMemory={totalMemory}
          hostShare={hostShare}
          orphanCount={orphanCount}
        />
        <ResourceManagerTree
          snapshot={resourceSnapshot}
          repos={unifiedRepos}
          sortOption={sortOption}
          collapsedRepos={collapsedRepos}
          collapsedWorktrees={collapsedWorktrees}
          activeWorktreeId={activeWorktreeId}
          isAppCollapsed={appCollapsed}
          isDaemonUnreachable={daemonUnreachable}
          oldWorkspaceCount={oldWorkspaceCount}
          orphanCount={orphanCount}
          setPopoverBodyNode={sessionKill.setPopoverBodyNode}
          onSortChange={setSortOption}
          onToggleRepo={toggleRepo}
          onToggleWorktree={toggleWorktree}
          onNavigateWorktree={navigateToWorktree}
          onNavigateTab={navigateToTab}
          onDeleteWorktree={deleteWorktree}
          onKillSession={sessionKill.request}
          onToggleApp={() => setAppCollapsed((current) => !current)}
          onOpenWorkspaceCleanup={handleOpenWorkspaceCleanup}
          onKillOrphans={() => void sessionKill.killOrphans()}
        />
        <WorkspaceSpaceCompactPanel onOpenFullPage={openSpaceResults} />
      </PopoverContent>
      <ResourceSessionKillDialog sessionKill={sessionKill} />
      <DaemonActionDialog api={daemonActions} />
    </Popover>
  )
}
