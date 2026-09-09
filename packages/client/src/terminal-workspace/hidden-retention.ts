import { captureTerminalShutdownBuffersBestEffort } from '~renderer/runtime/terminal-shutdown-buffer-captures'
import {
  shouldPreserveTerminalScrollbackBuffers,
  type RepoConnection
} from '~renderer/terminal-workspace/scrollback-buffers'

import {
  selectIdsBeyondHotRetain,
  TERMINAL_WORKTREE_COLD_PARK_DELAY_MS,
  type ColdParkRetainCandidate,
  type ColdParkableTerminalTab,
  type TerminalColdParkPolicyOverrides
} from '../terminal-pane/terminal-hidden-view-parking'

export const TERMINAL_HIDDEN_WORKTREE_RETENTION_LIMIT = 12
export const TERMINAL_HIDDEN_WORKTREE_RETENTION_TTL_MS = 45 * 60_000

export type TerminalWorktreeRetentionCandidate = {
  worktreeId: string
  terminalTabs: readonly ColdParkableTerminalTab[]
  hiddenSinceMs: number | null
  isVisible: boolean
  shouldMeasureHiddenWorktree: boolean
  parkCooldownUntilMs?: number | null
  ordinaryParkingCovers: boolean
}

function hasPendingSpawnWork(
  candidate: TerminalWorktreeRetentionCandidate,
  pendingStartupByTabId: Readonly<Record<string, unknown>>
): boolean {
  return candidate.terminalTabs.some((tab) => {
    const pendingActivationSpawn = tab.pendingActivationSpawn
    return (
      pendingStartupByTabId[tab.id] !== undefined ||
      pendingActivationSpawn === true ||
      (typeof pendingActivationSpawn === 'number' && pendingActivationSpawn > 0)
    )
  })
}

// Why: ordinary parking can be vetoed by one unrestorable local pane. Force
// park still bounds its restorable siblings; the renderer keeps only the
// unrestorable tab mounted through the per-tab eviction exemption.
export function selectRetentionForceParkedTerminalWorktrees(
  args: {
    worktrees: readonly TerminalWorktreeRetentionCandidate[]
    pendingStartupByTabId: Readonly<Record<string, unknown>>
    parkingEnabled: boolean
    retentionBudgetEnabled: boolean
    nowMs: number
  } & TerminalColdParkPolicyOverrides
): Set<string> {
  if (!args.parkingEnabled || !args.retentionBudgetEnabled) {
    return new Set()
  }
  const coldParkDelayMs = args.coldParkDelayMs ?? TERMINAL_WORKTREE_COLD_PARK_DELAY_MS
  const candidates: ColdParkRetainCandidate[] = []
  for (const worktree of args.worktrees) {
    if (
      worktree.hiddenSinceMs === null ||
      worktree.isVisible ||
      worktree.shouldMeasureHiddenWorktree ||
      worktree.ordinaryParkingCovers ||
      hasPendingSpawnWork(worktree, args.pendingStartupByTabId) ||
      (worktree.parkCooldownUntilMs != null && args.nowMs < worktree.parkCooldownUntilMs) ||
      args.nowMs - worktree.hiddenSinceMs < coldParkDelayMs
    ) {
      continue
    }
    candidates.push({ id: worktree.worktreeId, hiddenSinceMs: worktree.hiddenSinceMs })
  }

  const retentionTtlMs = args.retentionTtlMs ?? TERMINAL_HIDDEN_WORKTREE_RETENTION_TTL_MS
  const forceParkedIds = selectIdsBeyondHotRetain(candidates, {
    nowMs: args.nowMs,
    hotRetainMs: retentionTtlMs,
    hotRetainLimit: args.retentionLimit ?? TERMINAL_HIDDEN_WORKTREE_RETENTION_LIMIT
  })
  for (const candidate of candidates) {
    if (args.nowMs - candidate.hiddenSinceMs >= retentionTtlMs) {
      forceParkedIds.add(candidate.id)
    }
  }
  return forceParkedIds
}

export function captureRetentionForceParkedWorktreeBuffers(args: {
  worktreeId: string
  tabIds: readonly string[]
  repos: readonly RepoConnection[]
}): boolean {
  if (!shouldPreserveTerminalScrollbackBuffers(args.worktreeId, args.repos)) {
    return true
  }
  const { requested, captured } = captureTerminalShutdownBuffersBestEffort(args.tabIds, {
    includeLocalBuffers: false
  })
  return captured === requested
}
