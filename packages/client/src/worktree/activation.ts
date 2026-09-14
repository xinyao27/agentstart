import { parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { activateRuntimeWorktree } from '~renderer/runtime/worktree-lifecycle-target'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import { isWorkspaceBodyVisible } from '../application-shell/state/visible-surface'
import { readProjectCatalogRuntimeState } from '../project-catalog/runtime-state'
import { useAppStore } from '../store/state'
import { activateAndRevealFolderWorkspace } from '../workspace/activation'
import type { ActivateAndRevealResult, ActivateWorktreeOptions } from './activation-types'
import { buildCreatedAgentReopenStartup } from './agent-startup'
import { ensureWorktreeHasInitialTerminal } from './initial-terminal'
import { getRuntimeEnvironmentIdForWorktree } from './runtime-owner'
import { setWorktreeNavActivator } from './state/nav-history'

export { activateAndRevealFolderWorkspace } from '../workspace/activation'
export { ensureWorktreeHasInitialTerminal } from './initial-terminal'
export type { ActivateAndRevealResult, WorktreeStartupPayload } from './activation-types'

export function activateAndRevealWorktree(
  worktreeId: string,
  options?: ActivateWorktreeOptions
): ActivateAndRevealResult | false {
  const runtimeState = readProjectCatalogRuntimeState()
  const worktree = Object.values(runtimeState.worktreesByRepo)
    .flat()
    .find((candidate) => candidate.id === worktreeId)
  return worktree ? activateAndRevealKnownWorktree(worktree, options) : false
}

export function activateAndRevealKnownWorktree(
  worktree: Worktree,
  options?: ActivateWorktreeOptions
): ActivateAndRevealResult {
  const state = useAppStore.getState()
  const worktreeId = worktree.id
  const catalogRuntimeState = readProjectCatalogRuntimeState()
  const ownerWorktrees = catalogRuntimeState.worktreesByRepo[worktree.repoId] ?? []
  const runtimeState = {
    ...catalogRuntimeState,
    worktreesByRepo: {
      ...catalogRuntimeState.worktreesByRepo,
      [worktree.repoId]: ownerWorktrees.some((candidate) => candidate.id === worktree.id)
        ? ownerWorktrees
        : [...ownerWorktrees, worktree]
    }
  }
  const hasActivationWork = Boolean(options?.startup || options?.setup || options?.defaultTabs)
  const isPlainAlreadyActiveTerminal =
    !hasActivationWork &&
    state.activeRepoId === worktree.repoId &&
    state.activeWorktreeId === worktreeId &&
    isWorkspaceBodyVisible(state)
  if (worktree.repoId !== state.activeRepoId) {
    state.setActiveRepo(worktree.repoId)
  }
  state.setActiveWorktree(worktreeId)
  // Why: after the scope switch, so the landing tab belongs to this worktree
  // rather than the one being left.
  state.focusWorkspaceSurface()
  notifyHostRuntimeOfWorktreeActivation(runtimeState, worktreeId, options?.notifyHostRuntime)
  // Why: focus recency lands synchronously with selection so later startup or
  // reveal failures cannot leave Command Palette ordering behind what the user saw.
  if (!isPlainAlreadyActiveTerminal) {
    state.markWorktreeVisited(worktreeId)
    if (!state.isNavigatingHistory) {
      state.recordWorktreeVisit(worktreeId)
    }
  }
  const primaryTabId = ensureWorktreeHasInitialTerminal(
    { ...useAppStore.getState(), ...runtimeState },
    worktreeId,
    options?.startup ?? buildCreatedAgentReopenStartup(worktree),
    options?.setup,
    options?.defaultTabs
  )
  if (primaryTabId && options?.initialCwd) {
    useAppStore.getState().queueTabInitialCwd(primaryTabId, options.initialCwd)
  }
  revealActivatedWorktree(worktreeId, worktree.repoId, options)
  return { primaryTabId }
}

function notifyHostRuntimeOfWorktreeActivation(
  runtimeState: ReturnType<typeof readProjectCatalogRuntimeState>,
  worktreeId: string,
  notifyHostRuntime: boolean | undefined
): void {
  if (notifyHostRuntime === false) {
    return
  }
  const environmentId = getRuntimeEnvironmentIdForWorktree(runtimeState, worktreeId)
  void activateRuntimeWorktree(
    environmentId ? { kind: 'environment', environmentId } : { kind: 'local' },
    // Why: the daemon is the cross-client authority for the active workspace. A
    // side panel that only navigated the host tab never applies this activation
    // locally, so suppressing the client event left its sidebar on the old
    // worktree. The sending client's echo re-runs an idempotent activation.
    { worktree: toRuntimeWorktreeSelector(worktreeId), notifyClients: true }
  ).catch((error: unknown) => {
    toast.error(translate('worktree.activation.failed', 'Failed to activate workspace'), {
      description: error instanceof Error ? error.message : String(error)
    })
  })
}

function revealActivatedWorktree(
  worktreeId: string,
  repoId: string,
  options: ActivateWorktreeOptions | undefined
): void {
  const state = useAppStore.getState()
  // Why: a hidden card cannot receive the pending sidebar reveal.
  if (state.filterRepoIds.length > 0 && !state.filterRepoIds.includes(repoId)) {
    state.setFilterRepoIds([])
  }
  if (options?.revealInSidebar === false) {
    return
  }
  const revealOptions = options?.sidebarRevealBehavior
    ? { behavior: options.sidebarRevealBehavior }
    : undefined
  state.revealWorktreeInSidebar(worktreeId, revealOptions)
}

// Why: nav history imports the store, so registration avoids a static cycle
// while keeping replay on the same activation paths as direct navigation.
setWorktreeNavActivator((workspaceId) => {
  const scope = parseWorkspaceKey(workspaceId)
  return scope?.type === 'folder'
    ? activateAndRevealFolderWorkspace(scope.folderWorkspaceId)
    : activateAndRevealWorktree(workspaceId)
})
