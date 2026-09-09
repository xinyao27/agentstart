import type {
  WorkspaceCleanupBlocker,
  WorkspaceCleanupCandidate,
  WorkspaceCleanupDismissal
} from '@yiru/protocol'
import {
  applyWorkspaceCleanupPolicy,
  shouldHideWorkspaceCleanupCandidate
} from '@yiru/protocol/workspace/cleanup-policy'
import type { AppState } from '~renderer/store/types'

import {
  getPaneKeyTabId,
  hasFreshLiveAgent,
  hasWorkingTitleAgent,
  probeTerminalLiveness
} from './local-evidence'
import type { EnrichOptions, WorkspaceCleanupEnrichmentCacheEntry } from './types'

const RECENT_VISIBLE_CONTEXT_MS = 24 * 60 * 60 * 1000
const VIEWED_FROM_CLEANUP_MS = 2 * 60 * 60 * 1000

export async function enrichWorkspaceCleanupCandidates(
  candidates: readonly WorkspaceCleanupCandidate[],
  state: AppState,
  options: EnrichOptions = {}
): Promise<WorkspaceCleanupCandidate[]> {
  return Promise.all(
    candidates.map((candidate) => enrichWorkspaceCleanupCandidate(candidate, state, options))
  )
}

export async function enrichWorkspaceCleanupCandidatesWithCache(
  candidates: readonly WorkspaceCleanupCandidate[],
  state: AppState,
  cache: Map<string, WorkspaceCleanupEnrichmentCacheEntry>,
  options: EnrichOptions = {}
): Promise<WorkspaceCleanupCandidate[]> {
  return Promise.all(
    candidates.map(async (candidate) => {
      const inputSignature = getWorkspaceCleanupCandidateInputSignature(candidate)
      const localSignature = getWorkspaceCleanupLocalStateSignature(
        candidate.worktreeId,
        state,
        options
      )
      const cached = cache.get(candidate.worktreeId)
      if (cached?.inputSignature === inputSignature && cached.localSignature === localSignature) {
        return cached.candidate
      }

      const enriched = await enrichWorkspaceCleanupCandidate(candidate, state, options)
      cache.set(candidate.worktreeId, {
        inputSignature,
        localSignature,
        candidate: enriched
      })
      return enriched
    })
  )
}

function getWorkspaceCleanupCandidateInputSignature(candidate: WorkspaceCleanupCandidate): string {
  return JSON.stringify({
    fingerprint: candidate.fingerprint,
    blockers: candidate.blockers,
    reasons: candidate.reasons,
    git: candidate.git,
    lastActivityAt: candidate.lastActivityAt,
    createdAt: candidate.createdAt,
    path: candidate.path,
    branch: candidate.branch
  })
}

function getWorkspaceCleanupLocalStateSignature(
  worktreeId: string,
  state: AppState,
  options: EnrichOptions
): string {
  const tabs = state.tabsByWorktree[worktreeId] ?? []
  const tabIds = tabs.map((tab) => tab.id)
  const tabIdSet = new Set(tabIds)
  const openFiles = state.openFiles
    .filter((file) => file.worktreeId === worktreeId)
    .map((file) => ({
      id: file.id,
      isDirty: file.isDirty,
      hasDraft: state.editorDrafts[file.id] !== undefined
    }))
  const retainedDoneAgentPaneKeys = Object.entries(state.retainedAgentsByPaneKey)
    .filter(([, entry]) => entry.worktreeId === worktreeId && entry.entry.state === 'done')
    .map(([paneKey]) => paneKey)
    .sort()
  const agentStatuses = Object.values(state.agentStatusByPaneKey)
    .filter((entry) => tabIdSet.has(getPaneKeyTabId(entry.paneKey)))
    .map((entry) => ({
      paneKey: entry.paneKey,
      state: entry.state,
      updatedAt: entry.updatedAt
    }))
    .sort((a, b) => a.paneKey.localeCompare(b.paneKey))
  const ptyIdsByTabId = Object.fromEntries(
    tabIds.map((tabId) => [tabId, state.ptyIdsByTabId[tabId] ?? []])
  )
  const runtimePaneTitlesByTabId = Object.fromEntries(
    tabIds.map((tabId) => [tabId, state.runtimePaneTitlesByTabId[tabId] ?? {}])
  )
  const terminalLayoutsByTabId = Object.fromEntries(
    tabIds.map((tabId) => [tabId, state.terminalLayoutsByTabId?.[tabId]?.ptyIdsByLeafId ?? {}])
  )
  const dismissal =
    options.applyDismissals === false
      ? null
      : (state.workspaceCleanupDismissals[worktreeId] ?? null)

  return JSON.stringify({
    active: state.activeWorktreeId === worktreeId,
    tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title })),
    ptyIdsByTabId,
    runtimePaneTitlesByTabId,
    terminalLayoutsByTabId,
    openFiles,
    browserTabCount: (state.browserTabsByWorktree[worktreeId] ?? []).length,
    retainedDoneAgentPaneKeys,
    agentStatuses,
    lastVisitedAt: state.lastVisitedAtByWorktreeId[worktreeId] ?? 0,
    viewed: state.workspaceCleanupViewedCandidates[worktreeId] ?? null,
    dismissal
  })
}

async function enrichWorkspaceCleanupCandidate(
  candidate: WorkspaceCleanupCandidate,
  state: AppState,
  options: EnrichOptions
): Promise<WorkspaceCleanupCandidate> {
  const tabs = state.tabsByWorktree[candidate.worktreeId] ?? []
  const tabIds = new Set(tabs.map((tab) => tab.id))
  const openFiles = state.openFiles.filter((file) => file.worktreeId === candidate.worktreeId)
  const dirtyEditorBuffers = openFiles.filter(
    (file) => file.isDirty || state.editorDrafts[file.id] !== undefined
  )
  const cleanEditorTabCount = openFiles.length - dirtyEditorBuffers.length
  const browserTabCount = (state.browserTabsByWorktree[candidate.worktreeId] ?? []).length
  const retainedDoneAgentCount = Object.values(state.retainedAgentsByPaneKey).filter(
    (entry) => entry.worktreeId === candidate.worktreeId && entry.entry.state === 'done'
  ).length
  const blockers = candidate.blockers.filter((blocker) => blocker !== 'dismissed')
  const preserveCleanupInspection = shouldPreserveCleanupInspection(candidate, state)

  if (state.activeWorktreeId === candidate.worktreeId) {
    blockers.push('active-workspace')
  }
  if (dirtyEditorBuffers.length > 0) {
    blockers.push('dirty-editor-buffer')
  }
  if (hasFreshLiveAgent(state, tabIds)) {
    blockers.push('live-agent')
  }
  if (hasWorkingTitleAgent(state, tabs)) {
    blockers.push('live-agent')
  }

  const terminalProbe = await probeTerminalLiveness(state, tabs)
  if (terminalProbe === 'running') {
    blockers.push('running-terminal')
  } else if (terminalProbe === 'unknown') {
    blockers.push('terminal-liveness-unknown')
  }

  const lastVisitedAt = state.lastVisitedAtByWorktreeId[candidate.worktreeId] ?? 0
  const hasVisibleContext = cleanEditorTabCount > 0 || browserTabCount > 0
  if (
    hasVisibleContext &&
    !preserveCleanupInspection &&
    lastVisitedAt > 0 &&
    Date.now() - lastVisitedAt <= RECENT_VISIBLE_CONTEXT_MS
  ) {
    blockers.push('recent-visible-context')
  }

  const enriched = applyWorkspaceCleanupPolicy({
    ...candidate,
    blockers: [...new Set(blockers)],
    localContext: {
      ...candidate.localContext,
      terminalTabCount: tabs.length,
      cleanEditorTabCount,
      browserTabCount,
      retainedDoneAgentCount
    }
  })

  return options.applyDismissals === false
    ? enriched
    : applyDismissal(enriched, state.workspaceCleanupDismissals)
}

function shouldPreserveCleanupInspection(
  candidate: WorkspaceCleanupCandidate,
  state: AppState
): boolean {
  const viewed = state.workspaceCleanupViewedCandidates[candidate.worktreeId]
  if (!viewed?.wasSuggested || viewed.fingerprint !== candidate.fingerprint) {
    return false
  }
  // Why: View is part of cleanup review. It should not make the same
  // suggested row vanish on the next scan, but this exception must expire.
  return Date.now() - viewed.viewedAt <= VIEWED_FROM_CLEANUP_MS
}

export function applyDismissal(
  candidate: WorkspaceCleanupCandidate,
  dismissals: Record<string, WorkspaceCleanupDismissal>
): WorkspaceCleanupCandidate {
  if (!shouldHideWorkspaceCleanupCandidate(candidate, dismissals[candidate.worktreeId])) {
    return candidate
  }
  return applyWorkspaceCleanupPolicy({
    ...candidate,
    blockers: [...new Set<WorkspaceCleanupBlocker>([...candidate.blockers, 'dismissed'])]
  })
}
