import type { WorkspaceSessionPatch } from '@yiru/protocol/workspace/session'
import { isDecorativeAgentTitleFrameChange } from '~renderer/agent/decorative-title-signature'
import {
  isApplyingSessionProjection,
  registerSessionWriteFlush
} from '~renderer/runtime/session-document/projection-scope'

import { SESSION_RELEVANT_FIELDS, shouldPersistWorkspaceSession } from '../editor/workspace-session'
import type { AppState } from '../store/state'
import { buildWorkspaceSessionPatch } from './workspace-session-patch'

type SessionRelevantField = (typeof SESSION_RELEVANT_FIELDS)[number]
type TabsByWorktree = AppState['tabsByWorktree']
type TerminalTab = TabsByWorktree[string][number]
type UnifiedTabsByWorktree = AppState['unifiedTabsByWorktree']
type UnifiedTab = UnifiedTabsByWorktree[string][number]

const TERMINAL_TAB_LIVE_TITLE_KEYS = new Set<keyof TerminalTab>(['title'])
// Why: this handoff flag is stripped from workspace sessions, so toggling it
// alone should not rebuild and rewrite the durable session payload.
const TERMINAL_TAB_TRANSIENT_SESSION_KEYS = new Set<keyof TerminalTab>(['pendingActivationSpawn'])

function terminalTabChangedForSession(prev: TerminalTab, next: TerminalTab): boolean {
  if (prev === next) {
    return false
  }
  const keys = new Set([
    ...(Object.keys(prev) as (keyof TerminalTab)[]),
    ...(Object.keys(next) as (keyof TerminalTab)[])
  ])
  for (const key of keys) {
    if (TERMINAL_TAB_LIVE_TITLE_KEYS.has(key) || TERMINAL_TAB_TRANSIENT_SESSION_KEYS.has(key)) {
      continue
    }
    if (prev[key] !== next[key]) {
      return true
    }
  }
  return prev.title !== next.title && !isDecorativeAgentTitleFrameChange(prev.title, next.title)
}

function tabsByWorktreeChangedForSession(prev: TabsByWorktree, next: TabsByWorktree): boolean {
  if (prev === next) {
    return false
  }
  const worktreeIds = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const worktreeId of worktreeIds) {
    const prevTabs = prev[worktreeId] ?? []
    const nextTabs = next[worktreeId] ?? []
    if (prevTabs === nextTabs) {
      continue
    }
    if (prevTabs.length !== nextTabs.length) {
      return true
    }
    for (let i = 0; i < prevTabs.length; i += 1) {
      const prevTab = prevTabs[i]
      const nextTab = nextTabs[i]
      if (!prevTab || !nextTab || terminalTabChangedForSession(prevTab, nextTab)) {
        return true
      }
    }
  }
  return false
}

function unifiedTabChangedForSession(prev: UnifiedTab, next: UnifiedTab): boolean {
  if (prev === next) {
    return false
  }
  const keys = new Set([
    ...(Object.keys(prev) as (keyof UnifiedTab)[]),
    ...(Object.keys(next) as (keyof UnifiedTab)[])
  ])
  for (const key of keys) {
    if (key === 'label') {
      continue
    }
    if (prev[key] !== next[key]) {
      return true
    }
  }
  if (prev.label === next.label) {
    return false
  }
  if (prev.contentType !== 'terminal' || next.contentType !== 'terminal') {
    return true
  }
  return !isDecorativeAgentTitleFrameChange(prev.label, next.label)
}

function unifiedTabsByWorktreeChangedForSession(
  prev: UnifiedTabsByWorktree,
  next: UnifiedTabsByWorktree
): boolean {
  if (prev === next) {
    return false
  }
  const worktreeIds = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const worktreeId of worktreeIds) {
    const prevTabs = prev[worktreeId] ?? []
    const nextTabs = next[worktreeId] ?? []
    if (prevTabs === nextTabs) {
      continue
    }
    if (prevTabs.length !== nextTabs.length) {
      return true
    }
    for (let i = 0; i < prevTabs.length; i += 1) {
      const prevTab = prevTabs[i]
      const nextTab = nextTabs[i]
      if (!prevTab || !nextTab || unifiedTabChangedForSession(prevTab, nextTab)) {
        return true
      }
    }
  }
  return false
}

function sessionRelevantFieldChanged(
  key: SessionRelevantField,
  prevValue: unknown,
  nextValue: unknown
): boolean {
  if (prevValue === nextValue) {
    return false
  }
  if (key === 'tabsByWorktree') {
    // Why: focused agent CLIs can emit spinner/title OSC frames many times per
    // second. Those labels are live UI chrome, not durable terminal topology.
    return tabsByWorktreeChangedForSession(prevValue as TabsByWorktree, nextValue as TabsByWorktree)
  }
  if (key === 'unifiedTabsByWorktree') {
    // Why: terminal live titles are mirrored into unified tab labels, so the
    // same decorative frames must not wake unified-tab session persistence.
    return unifiedTabsByWorktreeChangedForSession(
      prevValue as UnifiedTabsByWorktree,
      nextValue as UnifiedTabsByWorktree
    )
  }
  return true
}

export type WorkspaceSessionWrite = {
  patch: WorkspaceSessionPatch
}

export type SessionWriteSubscriberDeps = {
  store: {
    subscribe: (listener: (state: AppState) => void) => () => void
    getState: () => AppState
  }
  persist: (payload: WorkspaceSessionWrite) => void
  shouldSchedulePersist?: () => boolean
}

/**
 * The gate against unrelated updates (agent status, usage, runtime title ticks)
 * is load-bearing for setTimeout violation budgets.
 */
export function createSessionWriteSubscriber({
  store,
  persist,
  shouldSchedulePersist
}: SessionWriteSubscriberDeps): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  // Why: the subscriber fires on every store update (agent status, usage
  // refreshes, runtime title ticks, …). Without this gate each fire reset
  // the debounce, and when it finally expired buildWorkspaceSessionPayload
  // crossed 70-110ms with many tabs, tripping setTimeout violations. Compare
  // each session-feeding field by reference against the prior snapshot and
  // skip both the timer reset and the rebuild when none changed. `null`
  // sentinel guarantees the very first fire always proceeds.
  let prev: Record<string, unknown> | null = null
  const pendingChangedFields = new Set<SessionRelevantField>()

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    const fresh = store.getState()
    if (
      !shouldPersistWorkspaceSession(fresh) ||
      (shouldSchedulePersist && !shouldSchedulePersist())
    ) {
      pendingChangedFields.clear()
      return
    }
    if (pendingChangedFields.size === 0) {
      return
    }
    const changed = new Set(pendingChangedFields)
    pendingChangedFields.clear()
    const patch = buildWorkspaceSessionPatch(fresh, changed)
    if (Object.keys(patch).length > 0) {
      persist({ patch })
    }
  }
  const unregisterFlush = registerSessionWriteFlush(flush)

  const unsub = store.subscribe((state) => {
    if (!shouldPersistWorkspaceSession(state)) {
      return
    }
    const changedFields: SessionRelevantField[] = []
    if (prev === null) {
      changedFields.push(...SESSION_RELEVANT_FIELDS)
    } else {
      for (const key of SESSION_RELEVANT_FIELDS) {
        if (sessionRelevantFieldChanged(key, prev[key], state[key])) {
          changedFields.push(key)
        }
      }
    }
    if (changedFields.length === 0) {
      return
    }
    const next: Record<string, unknown> = {}
    for (const key of SESSION_RELEVANT_FIELDS) {
      next[key] = state[key]
    }
    prev = next
    if (isApplyingSessionProjection()) {
      return
    }
    for (const field of changedFields) {
      pendingChangedFields.add(field)
    }
    if (shouldSchedulePersist && !shouldSchedulePersist()) {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pendingChangedFields.clear()
      return
    }
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(flush, 150)
  })

  return () => {
    unregisterFlush()
    unsub()
    if (timer !== null) {
      clearTimeout(timer)
    }
    pendingChangedFields.clear()
  }
}
