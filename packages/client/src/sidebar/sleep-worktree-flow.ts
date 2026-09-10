import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { sleepRuntimeWorktree } from '~renderer/runtime/worktree-lifecycle-target'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import {
  clearWorktreeSleepIntent,
  markWorktreeSleepIntent
} from '~renderer/sidebar/worktree-sleep-intent'
import { useAppStore } from '~renderer/store/state'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

function getSidebarWorktreeOptions(worktreeId: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-worktree-id]')).filter(
    (element) => element.dataset.worktreeId === worktreeId
  )
}

function isPinnedSidebarWorktreeOption(element: HTMLElement): boolean {
  // Why: duplicated pinned rows share a worktree id, so row-key scope is the
  // stable signal that distinguishes the pinned copy from natural rows.
  return element.dataset.worktreeRowKey?.startsWith('pinned:') === true
}

function findPrimarySidebarWorktreeOption(worktreeId: string): HTMLElement | null {
  const options = getSidebarWorktreeOptions(worktreeId)
  return (
    options.find((element) =>
      element.querySelector<HTMLElement>('[data-worktree-card-active="primary"]')
    ) ??
    options.find((element) => !isPinnedSidebarWorktreeOption(element)) ??
    options[0] ??
    null
  )
}

function findSidebarWorktreeRow(worktreeId: string, rowKey?: string): HTMLElement | null {
  const options = getSidebarWorktreeOptions(worktreeId)
  const option = rowKey
    ? (options.find((element) => element.dataset.worktreeRowKey === rowKey) ?? null)
    : (findPrimarySidebarWorktreeOption(worktreeId) ?? null)
  return option?.closest<HTMLElement>('[data-worktree-virtual-row]') ?? null
}

function preserveSidebarWorktreePosition(worktreeId: string): () => void {
  if (typeof document === 'undefined') {
    return () => {}
  }
  const getScroller = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('[data-worktree-sidebar]')
  const scroller = getScroller()
  const activeOption = findPrimarySidebarWorktreeOption(worktreeId)
  const activeRowKey = activeOption?.dataset.worktreeRowKey
  const row = activeOption?.closest<HTMLElement>('[data-worktree-virtual-row]') ?? null
  if (!scroller || !row) {
    return () => {}
  }
  const previousScrollTop = scroller.scrollTop
  const previousScrollHeight = scroller.scrollHeight
  const previousTop = row.getBoundingClientRect().top

  return () => {
    let attempts = 0
    const restore = (): void => {
      const currentScroller = getScroller()
      if (!currentScroller) {
        attempts += 1
        if (attempts < 12) {
          window.requestAnimationFrame(restore)
        }
        return
      }
      const nextRow = findSidebarWorktreeRow(worktreeId, activeRowKey)
      if (!nextRow) {
        // Why: a remount can first render the wrong virtual window. Put the
        // scroller near the same content after height changes so the row
        // mounts, then retry and correct by actual DOM position.
        currentScroller.scrollTop = Math.max(
          0,
          previousScrollTop + currentScroller.scrollHeight - previousScrollHeight
        )
      } else {
        const delta = nextRow.getBoundingClientRect().top - previousTop
        if (Math.abs(delta) > 1) {
          currentScroller.scrollTop += delta
        }
      }
      attempts += 1
      if (attempts < 12) {
        window.requestAnimationFrame(restore)
      }
    }
    window.requestAnimationFrame(restore)
  }
}

export async function runSleepWorktrees(worktreeIds: readonly string[]): Promise<boolean> {
  if (worktreeIds.length === 0) {
    return true
  }
  const { activeWorktreeId, setActiveWorktree, shutdownWorktreeBrowsers } = useAppStore.getState()
  let activeSleepIntentWorktreeId: string | null = null
  if (activeWorktreeId && worktreeIds.includes(activeWorktreeId)) {
    const restoreSidebarPosition = preserveSidebarWorktreePosition(activeWorktreeId)
    // Why: pane teardown must not stamp activity for an intentional sleep.
    markWorktreeSleepIntent(activeWorktreeId)
    activeSleepIntentWorktreeId = activeWorktreeId
    setActiveWorktree(null)
    restoreSidebarPosition()
  }
  const errors: string[] = []
  try {
    for (const worktreeId of worktreeIds) {
      try {
        // Why: browser resources belong to this browser host; PTY shutdown belongs to the daemon.
        await shutdownWorktreeBrowsers(worktreeId)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
        continue
      }
      try {
        const environmentId = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
        await sleepRuntimeWorktree(
          environmentId ? { kind: 'environment', environmentId } : { kind: 'local' },
          toRuntimeWorktreeSelector(worktreeId)
        )
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
  } finally {
    if (activeSleepIntentWorktreeId) {
      clearWorktreeSleepIntent(activeSleepIntentWorktreeId)
    }
  }
  if (errors.length > 0) {
    // Why: callers are fire-and-forget; surface the failure as a toast and
    // otherwise continue — the active-worktree reset already happened so we
    // don't leave the UI in a stale state.
    toast.error(
      worktreeIds.length === 1
        ? translate(
            'auto.components.sidebar.sleep.worktree.flow.8bc3fc0671',
            'Failed to sleep workspace'
          )
        : translate(
            'auto.components.sidebar.sleep.worktree.flow.c460fecc4a',
            'Failed to sleep some workspaces'
          ),
      {
        description: errors.join('\n')
      }
    )
  }
  return errors.length === 0
}
