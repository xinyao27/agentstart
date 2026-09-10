import type { CreateWorktreeResult } from '@agentstart/protocol/worktree/create-result'
import { toast } from 'sonner'
import { createBrowserUuid } from '~renderer/browser/uuid'
import {
  formatWorkspaceCreateError,
  getWorkspaceCreateErrorToastMessage
} from '~renderer/new-workspace-composer-card/workspace-create-error-format'
import { useAppStore } from '~renderer/store/state'
import type {
  WorktreeCreationPhase,
  WorktreeCreationRequest
} from '~renderer/worktree-creation/pending'

import { completeWorktreeCreationHandoff } from './handoff'

function getWorktreeCreationIndeterminate(request: WorktreeCreationRequest): boolean {
  if (request.worktreeCreateProgressMode) {
    return request.worktreeCreateProgressMode === 'indeterminate'
  }
  return false
}

// Why: activePendingCreationId can outlive the terminal route when the user
// switches app views; only the terminal route renders the creation panel.
function isPendingCreationSurfaceVisible(creationId: string): boolean {
  const state = useAppStore.getState()
  return state.activeView === 'terminal' && state.activePendingCreationId === creationId
}

function revealPendingCreation(
  creationId: string,
  request: WorktreeCreationRequest,
  phase: WorktreeCreationPhase
): void {
  const store = useAppStore.getState()
  const indeterminate = getWorktreeCreationIndeterminate(request)
  store.beginPendingWorktreeCreation({
    creationId,
    phase,
    status: 'creating',
    startedAt: Date.now(),
    indeterminate,
    // Why: the creation surface owns the tab strip immediately. Delaying this
    // caused the real workspace tab bar to flash out when the debounce elapsed.
    loaderVisible: true,
    request
  })
  // Why: the creation panel only renders under the terminal view (App content
  // router), so force it active so the panel is what fills the content area.
  store.setActiveView('terminal')
  store.setSidebarOpen(true)
}

async function executeWorktreeCreation(
  creationId: string,
  request: WorktreeCreationRequest
): Promise<void> {
  let result: CreateWorktreeResult
  try {
    result = await useAppStore
      .getState()
      .createWorktree(
        request.repoId,
        request.name,
        request.baseBranch,
        request.setupDecision,
        request.sparseCheckout,
        request.telemetrySource,
        request.displayName,
        request.linkedPR,
        request.pushTarget,
        request.agent ?? undefined,
        request.branchNameOverride,
        request.workspaceStatus,
        request.startup,
        request.pendingFirstAgentMessageRename,
        creationId,
        request.compareBaseRef
      )
  } catch (error) {
    // Why: a missing entry means the user cancelled mid-flight — abandon
    // silently rather than surfacing an error for work they already dismissed.
    if (!useAppStore.getState().pendingWorktreeCreations[creationId]) {
      return
    }
    const message = getWorkspaceCreateErrorToastMessage(formatWorkspaceCreateError(error))
    // Why: an error must stay on the same creation surface that owns the faux
    // tab strip, rather than falling back to stale previous-workspace tabs.
    useAppStore.getState().updatePendingWorktreeCreation(creationId, {
      status: 'error',
      error: message
    })
    // Why: only toast when the panel isn't already showing this error (the user
    // navigated away), so a visible failure isn't announced twice.
    if (!isPendingCreationSurfaceVisible(creationId)) {
      toast.error(message)
    }
    return
  }

  await completeWorktreeCreationHandoff(creationId, request, result)
}

/**
 * Kick off a worktree create in the background. The caller (the composer) has
 * already resolved every interactive decision into `request`, so this returns
 * immediately and the work outlives the now-closed modal. Progress and errors
 * surface on the pending creation's sidebar row and content panel.
 */
export function runBackgroundWorktreeCreation(request: WorktreeCreationRequest): void {
  // Why: crypto.randomUUID is undefined in non-secure browser contexts (LAN web
  // client over plain HTTP). createBrowserUuid falls back to getRandomValues.
  const creationId = createBrowserUuid()
  revealPendingCreation(creationId, request, 'preparing')
  void executeWorktreeCreation(creationId, request)
}

/** Re-run a failed creation from its panel, reusing the captured request. */
export function retryBackgroundWorktreeCreation(creationId: string): void {
  const store = useAppStore.getState()
  const entry = store.pendingWorktreeCreations[creationId]
  if (!entry) {
    return
  }
  store.updatePendingWorktreeCreation(creationId, {
    status: 'creating',
    startedAt: Date.now(),
    phase: 'preparing',
    error: undefined
  })
  store.setActivePendingWorktreeCreation(creationId)
  store.setActiveView('terminal')
  store.setSidebarOpen(true)
  void executeWorktreeCreation(creationId, entry.request)
}
