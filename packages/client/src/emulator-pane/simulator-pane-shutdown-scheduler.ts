import { shouldShutdownSimulatorForPaneUnmountFromTabs } from '~renderer/emulator-pane/tab-shutdown'
import { requireEmulatorClient } from '~renderer/runtime/emulator-target'
import { useAppStore } from '~renderer/store/state'

type SimulatorTabReference = {
  id: string
  contentType: string
}

type SimulatorPaneShutdownOptions = {
  getTabsForWorktree?: (worktreeId: string) => SimulatorTabReference[]
  shutdownManagedSimulator?: (worktreeId: string) => Promise<unknown> | unknown
}

type ScheduleSimulatorPaneShutdownOptions = SimulatorPaneShutdownOptions & {
  delayMs?: number
}

const DEFAULT_SHUTDOWN_GRACE_MS = 1_500

const pendingShutdownTimersByWorktree = new Map<string, ReturnType<typeof setTimeout>>()

function getUnifiedTabsForWorktree(worktreeId: string): SimulatorTabReference[] {
  return useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? []
}

async function shutdownManagedSimulator(worktreeId: string): Promise<unknown> {
  const client = await requireEmulatorClient()
  return client.shutdown({ worktree: worktreeId, managedOnly: true })
}

export async function shutdownManagedSimulatorIfNoPane(
  worktreeId: string,
  tabId?: string,
  options: SimulatorPaneShutdownOptions = {}
): Promise<boolean> {
  const getTabsForWorktree = options.getTabsForWorktree ?? getUnifiedTabsForWorktree
  if (!shouldShutdownSimulatorForPaneUnmountFromTabs(getTabsForWorktree(worktreeId), tabId)) {
    return false
  }
  const shutdown = options.shutdownManagedSimulator ?? shutdownManagedSimulator
  await Promise.resolve(shutdown(worktreeId)).catch(() => {})
  return true
}

export function cancelPendingSimulatorPaneShutdown(worktreeId: string): void {
  const timer = pendingShutdownTimersByWorktree.get(worktreeId)
  if (!timer) {
    return
  }
  clearTimeout(timer)
  pendingShutdownTimersByWorktree.delete(worktreeId)
}

export function scheduleSimulatorPaneManagedShutdown(
  worktreeId: string,
  tabId?: string,
  options: ScheduleSimulatorPaneShutdownOptions = {}
): boolean {
  const getTabsForWorktree = options.getTabsForWorktree ?? getUnifiedTabsForWorktree
  if (!shouldShutdownSimulatorForPaneUnmountFromTabs(getTabsForWorktree(worktreeId), tabId)) {
    return false
  }

  cancelPendingSimulatorPaneShutdown(worktreeId)
  const delayMs = options.delayMs ?? DEFAULT_SHUTDOWN_GRACE_MS
  const shutdown = options.shutdownManagedSimulator ?? shutdownManagedSimulator
  const timer = setTimeout(() => {
    pendingShutdownTimersByWorktree.delete(worktreeId)
    if (!shouldShutdownSimulatorForPaneUnmountFromTabs(getTabsForWorktree(worktreeId))) {
      return
    }
    // Why: closing/reopening or moving a simulator tab briefly unmounts the pane.
    // Delaying avoids killing a stream that the replacement pane is about to reuse.
    void shutdownManagedSimulatorIfNoPane(worktreeId, undefined, {
      getTabsForWorktree,
      shutdownManagedSimulator: shutdown
    })
  }, delayMs)
  pendingShutdownTimersByWorktree.set(worktreeId, timer)
  return true
}
