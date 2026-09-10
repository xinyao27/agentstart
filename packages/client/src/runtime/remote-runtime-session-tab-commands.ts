import { useAppStore } from '../store/state'
import { resolveRemoteRuntimeSessionEnvironmentId } from './remote-runtime-session-environment'
import { recordRemoteSessionCloseIntent } from './remote-session/close-intent'
import { closeRemoteSessionTabCommand } from './remote-session/commands'
import { recordRemoteSessionReorderIntent } from './remote-session/reorder-intent'
import type { RuntimeMobileSessionTabMove } from './remote-session/session-model'
import { requestRemoteSessionTabsRefresh } from './remote-session/tabs-refresh-requests'
import { isRemoteTerminalSurfaceTabId, toHostSessionTabId } from './remote-terminal-surface-id'
import { requireSessionTabsClient } from './session-tabs-target'
import { toRuntimeWorktreeSelector } from './worktree-selector'

type RemoteRuntimeSessionTabArgs = {
  worktreeId: string
  tabId: string
  environmentId?: string | null
}

export function activateRemoteRuntimeSessionTab(
  args: RemoteRuntimeSessionTabArgs
): Promise<boolean> {
  return callRemoteRuntimeSessionTabMethod('activate', args)
}

export function closeRemoteRuntimeSessionTab(args: RemoteRuntimeSessionTabArgs): Promise<boolean> {
  return callRemoteRuntimeSessionTabMethod('close', args)
}

export async function moveRemoteRuntimeSessionTab(
  args: RuntimeMobileSessionTabMove & {
    worktreeId: string
    environmentId?: string | null
  }
): Promise<boolean> {
  const environmentId = resolveRemoteRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return false
  }
  if (args.kind === 'reorder') {
    // Why: hold the local intent before host-ID resolution so an older
    // in-flight snapshot cannot snap the tab back.
    recordRemoteSessionReorderIntent(args.worktreeId, args.targetGroupId, args.tabOrder, Date.now())
  }
  try {
    const { resolveHostSessionTabIdForRemoteSessionTab } =
      await import('./remote-session/tabs-tracking')
    const state = useAppStore.getState()
    const resolveHostBackedTabId = (tabId: string): string | null =>
      resolveHostSessionTabIdForRemoteSessionTab(state, {
        environmentId,
        worktreeId: args.worktreeId,
        tabId
      }) ?? (isRemoteTerminalSurfaceTabId(tabId) ? toHostSessionTabId(tabId) : null)
    const movedHostTabId =
      args.kind === 'reorder'
        ? resolveHostBackedTabId(args.tabId)
        : (resolveHostBackedTabId(args.tabId) ?? args.tabId)
    if (!movedHostTabId) {
      return false
    }
    const reorderedHostTabOrder =
      args.kind === 'reorder'
        ? args.tabOrder
            .map(resolveHostBackedTabId)
            .filter((tabId): tabId is string => Boolean(tabId))
        : null
    if (reorderedHostTabOrder && !reorderedHostTabOrder.includes(movedHostTabId)) {
      return false
    }
    const targetHostIndex = resolveTargetHostIndex(args, state, resolveHostBackedTabId)
    await requireSessionTabsClient({ kind: 'environment', environmentId }).then((client) =>
      client.move(
        {
          worktree: toRuntimeWorktreeSelector(args.worktreeId),
          tabId: movedHostTabId,
          targetGroupId: args.targetGroupId,
          kind: args.kind,
          ...(args.kind === 'reorder' ? { tabOrder: reorderedHostTabOrder ?? [] } : {}),
          ...(args.kind === 'move-to-group' ? { index: targetHostIndex } : {}),
          ...(args.kind === 'split' ? { splitDirection: args.splitDirection } : {})
        },
        { timeoutMs: 15_000 }
      )
    )
    return true
  } catch (error) {
    logRemoteRuntimeSessionFailure('move tab', error)
    return false
  }
}

async function callRemoteRuntimeSessionTabMethod(
  method: 'activate' | 'close',
  args: RemoteRuntimeSessionTabArgs
): Promise<boolean> {
  const environmentId = resolveRemoteRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return false
  }
  if (method === 'close') {
    // Why: record before the async host-ID import; otherwise an older snapshot
    // can re-materialize the locally closed mirror in that gap.
    recordRemoteSessionCloseIntent(args.worktreeId, toHostSessionTabId(args.tabId), Date.now())
  }
  try {
    const { resolveHostSessionTabIdForRemoteSessionTab } =
      await import('./remote-session/tabs-tracking')
    const hostTabId =
      resolveHostSessionTabIdForRemoteSessionTab(useAppStore.getState(), {
        environmentId,
        worktreeId: args.worktreeId,
        tabId: args.tabId
      }) ?? toHostSessionTabId(args.tabId)
    if (method === 'close') {
      recordRemoteSessionCloseIntent(args.worktreeId, hostTabId, Date.now())
      const result = await closeRemoteSessionTabCommand({
        environmentId,
        worktreeId: args.worktreeId,
        tabId: hostTabId
      })
      if (result.status === 'failed') {
        throw result.error
      }
      await requestRemoteSessionTabsRefresh({ environmentId, worktreeId: args.worktreeId })
      return true
    }
    await requireSessionTabsClient({ kind: 'environment', environmentId }).then((client) =>
      client.activate(
        { worktree: toRuntimeWorktreeSelector(args.worktreeId), tabId: hostTabId },
        { timeoutMs: 15_000 }
      )
    )
    return true
  } catch (error) {
    logRemoteRuntimeSessionFailure(`${method} tab`, error)
    return false
  }
}

function resolveTargetHostIndex(
  args: RuntimeMobileSessionTabMove & { worktreeId: string },
  state: ReturnType<typeof useAppStore.getState>,
  resolveHostBackedTabId: (tabId: string) => string | null
): number | undefined {
  if (args.kind !== 'move-to-group' || typeof args.index !== 'number') {
    return args.kind === 'move-to-group' ? args.index : undefined
  }
  // Why: web groups may contain local-only tabs, so the host insertion index
  // counts only the filtered host-backed order.
  return (
    state.groupsByWorktree[args.worktreeId]
      ?.find((group) => group.id === args.targetGroupId)
      ?.tabOrder.slice(0, args.index)
      .map(resolveHostBackedTabId)
      .filter((tabId): tabId is string => Boolean(tabId)).length ?? args.index
  )
}

function logRemoteRuntimeSessionFailure(action: string, error: unknown): void {
  console.warn(
    `[remote-runtime-session] failed to ${action}:`,
    error instanceof Error ? error.message : String(error)
  )
}
