import type { WorkspaceCleanupDismissal } from '@yiru/protocol'
import {
  normalizeExecutionHostScope,
  normalizeVisibleExecutionHostIds
} from '@yiru/protocol/host/identity'
import { persistedUIValuesEqual } from '@yiru/protocol/settings/ui-equality'
import type {
  PersistedUIState,
  StatusBarItem,
  VisibleWorkspaceHostIds,
  TopLevelView
} from '@yiru/protocol/settings/ui-state'
import { parsePaneKey } from '@yiru/protocol/terminal/pane-identity'
import { WORKSPACE_CLEANUP_CLASSIFIER_VERSION } from '@yiru/protocol/workspace/cleanup-policy'
import type { PersistedTrustedYiruHooks } from '@yiru/protocol/worktree/hooks'
import { buildAgentNotificationId } from '~renderer/agent/notification-id'

import type { AppState } from '../../store/types'
import type { UISlice } from './slice'

export const DEFAULT_ON_PORTS_STATUS_BAR_ITEM: StatusBarItem = 'ports'

export function normalizeHydratedVisibleWorkspaceHostIds(
  ui: PersistedUIState
): VisibleWorkspaceHostIds {
  const visibleHostIds = normalizeVisibleExecutionHostIds(ui.visibleWorkspaceHostIds)
  if (visibleHostIds) {
    return visibleHostIds
  }
  const legacyScope = normalizeExecutionHostScope(ui.workspaceHostScope)
  return legacyScope === 'all' ? null : [legacyScope]
}

export const MIN_SIDEBAR_WIDTH = 240
export const MAX_LEFT_SIDEBAR_WIDTH = 500
// Why: the right sidebar drag-resize is window-relative (see right-sidebar
// component), so persisted widths can legitimately be well above the old 500px
// cap on wide displays. Use a large hard ceiling purely as a safety net for
// corrupted/manually-edited values rather than as a product limit.
export const MAX_RIGHT_SIDEBAR_WIDTH = 4000
// Why: bound disk growth for acknowledgedAgentsByPaneKey across hard quits —
// in-session cleanup (agent-status.ts) prunes on pane lifecycle, but crash/
// forced-kill paths leave entries pinned. Mirrors HYDRATE_MAX_AGE_MS in
// src/main/agent-hooks/server.ts for parallel reasoning with the sibling
// hook-status entries these acks pair with.
export const HYDRATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export function resolvePaneKeyWorktreeIdFromTabs(state: AppState, paneKey: string): string | null {
  const parsed = parsePaneKey(paneKey)
  if (!parsed) {
    return null
  }
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree ?? {})) {
    if (tabs.some((tab) => tab.id === parsed.tabId)) {
      return worktreeId
    }
  }
  return null
}

export function collectAcknowledgedAgentNotificationId({
  ids,
  worktreeId,
  paneKey,
  stateStartedAt,
  previousAckAt
}: {
  ids: Set<string>
  worktreeId: string | null | undefined
  paneKey: string
  stateStartedAt: number | null | undefined
  previousAckAt: number
}): void {
  if (typeof stateStartedAt !== 'number' || previousAckAt >= stateStartedAt) {
    return
  }
  const id = buildAgentNotificationId({ worktreeId, paneKey, stateStartedAt })
  if (id) {
    ids.add(id)
  }
}

export function isPlainPersistedRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function sanitizePersistedRepoIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((repoId): repoId is string => typeof repoId === 'string')
}

export function sanitizeTrustedYiruHooks(trust: unknown): PersistedTrustedYiruHooks {
  if (!isPlainPersistedRecord(trust)) {
    return {}
  }
  const next: PersistedTrustedYiruHooks = {}
  for (const [repoId, entry] of Object.entries(trust)) {
    if (!isSafePersistedRecordKey(repoId) || !isPlainPersistedRecord(entry)) {
      continue
    }
    next[repoId] = entry as PersistedTrustedYiruHooks[string]
  }
  return next
}

export function filterTrustedYiruHooksToValidRepos(
  trust: unknown,
  validRepoIds: Set<string>
): PersistedTrustedYiruHooks {
  const sanitized = sanitizeTrustedYiruHooks(trust)
  const next: PersistedTrustedYiruHooks = {}
  for (const [repoId, entry] of Object.entries(sanitized)) {
    if (validRepoIds.has(repoId)) {
      next[repoId] = entry
    }
  }
  return next
}

export function hydrateTrustedYiruHooks(
  trust: unknown,
  validRepoIds: Set<string>
): PersistedTrustedYiruHooks {
  const sanitized = sanitizeTrustedYiruHooks(trust)
  if (validRepoIds.size === 0) {
    return sanitized
  }
  return filterTrustedYiruHooksToValidRepos(sanitized, validRepoIds)
}

export function isSafePersistedRecordKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

export function sanitizeShowDotfilesByWorktree(value: unknown): Record<string, boolean> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const out: Record<string, boolean> = {}
  for (const [worktreeId, showDotfiles] of Object.entries(value as Record<string, unknown>)) {
    if (!worktreeId || !isSafePersistedRecordKey(worktreeId) || typeof showDotfiles !== 'boolean') {
      continue
    }
    out[worktreeId] = showDotfiles
  }
  return out
}

export function sanitizePersistedSidebarWidth(
  width: unknown,
  fallback: number,
  maxWidth: number
): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) {
    return fallback
  }
  return Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, width))
}

// Why: persisted JSON can be tampered with or carry legacy/corrupt shapes.
// Reject arrays (typeof [] === 'object'), prototype-pollution keys, and
// non-positive-finite values; drop entries past the TTL so hard-quit leaks
// don't accumulate forever.
export function sanitizeAcknowledgedAgentsByPaneKey(value: unknown): Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const cutoff = Date.now() - HYDRATE_MAX_AGE_MS
  const out: Record<string, number> = {}
  for (const [key, ackAt] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== 'string' || !isSafePersistedRecordKey(key)) {
      continue
    }
    if (typeof ackAt !== 'number' || !Number.isFinite(ackAt) || ackAt <= 0) {
      continue
    }
    if (ackAt < cutoff) {
      continue
    }
    out[key] = ackAt
  }
  return out
}

export function sanitizeWorkspaceCleanupDismissals(
  value: unknown
): Record<string, WorkspaceCleanupDismissal> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const out: Record<string, WorkspaceCleanupDismissal> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      continue
    }
    const input = raw as Record<string, unknown>
    if (
      typeof input.worktreeId !== 'string' ||
      typeof input.dismissedAt !== 'number' ||
      !Number.isFinite(input.dismissedAt) ||
      typeof input.fingerprint !== 'string' ||
      input.classifierVersion !== WORKSPACE_CLEANUP_CLASSIFIER_VERSION
    ) {
      continue
    }
    out[key] = {
      worktreeId: input.worktreeId,
      dismissedAt: input.dismissedAt,
      fingerprint: input.fingerprint,
      classifierVersion: input.classifierVersion
    }
  }
  return out
}

export function hydratedUIPartialMatchesState(
  state: AppState,
  hydrated: Partial<UISlice>
): boolean {
  return Object.entries(hydrated).every(([key, value]) =>
    persistedUIValuesEqual(state[key as keyof AppState], value)
  )
}

// Record keys are exhaustive over TopLevelView, so a new view can't be silently missed.
export const TOP_LEVEL_VIEW_LOOKUP: Record<TopLevelView, true> = {
  home: true,
  terminal: true,
  settings: true,
  space: true,
  skills: true,
  mobile: true
}
export const KNOWN_TOP_LEVEL_VIEWS = new Set<string>(Object.keys(TOP_LEVEL_VIEW_LOOKUP))
