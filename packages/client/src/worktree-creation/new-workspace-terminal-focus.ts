import { isWorkspaceBodyVisible } from '~renderer/application-shell/state/visible-surface'
import { focusRuntimeTerminalSurface } from '~renderer/runtime/sync-runtime-graph'
import { useAppStore } from '~renderer/store/state'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import type { ActivateAndRevealResult } from '~renderer/worktree/activation'

function resolveCreatedWorkspaceTerminalTabId(
  worktreeId: string,
  activation: ActivateAndRevealResult | false
): string | null {
  const state = useAppStore.getState()
  if (activation && activation.primaryTabId) {
    return activation.primaryTabId
  }
  if (
    state.activeWorktreeId !== worktreeId ||
    !isWorkspaceBodyVisible(state) ||
    state.activeTabType !== 'terminal'
  ) {
    return null
  }
  return state.activeTabId
}

export function queueNewWorkspaceTerminalFocus(
  worktreeId: string,
  activation: ActivateAndRevealResult | false
): void {
  const tabId = resolveCreatedWorkspaceTerminalTabId(worktreeId, activation)
  if (!tabId) {
    return
  }

  requestAnimationFrame(() => {
    const state = useAppStore.getState()
    if (
      state.activeWorktreeId !== worktreeId ||
      !isWorkspaceBodyVisible(state) ||
      state.activeTabType !== 'terminal' ||
      state.activeTabId !== tabId
    ) {
      return
    }

    // Why: creation closes a Radix dialog immediately after activation. Queue
    // focus past that close so focus restoration cannot leave the user on the
    // removed composer field after Cmd/Ctrl+Enter.
    if (!focusRuntimeTerminalSurface(tabId)) {
      focusTerminalTabSurface(tabId)
    }
  })
}
