import type { FolderWorkspace } from '@yiru/protocol/workspace/folder'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode
} from '@yiru/protocol/workspace/session'
import type { LocalBaseRefRefreshResult } from '@yiru/protocol/worktree/create-result'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'

export const WORKTREE_REMOVAL_AMBIGUOUS_ERROR =
  'Workspace identity is ambiguous across hosts. Refresh projects and try again.'
export const ACTIVE_WORKTREE_TERMINAL_PREP_DELAY_MS = 300
export const ACTIVE_WORKTREE_TERMINAL_PREP_INPUT_QUIET_MS = 450
export const ACTIVE_WORKTREE_TERMINAL_PREP_IDLE_TIMEOUT_MS = 180
export const pendingActivationTerminalPrepCancels = new Map<string, () => void>()
export const detachedHeadAutoDerivedDisplayNames = new Map<string, string>()
export const folderWorkspaceWorktreeCache = new WeakMap<FolderWorkspace, Worktree>()
export const hostedReviewPushTargetLookupsInFlight = new Set<string>()

export function countTerminalLayoutLeaves(node: TerminalPaneLayoutNode | null | undefined): number {
  if (!node) {
    return 0
  }
  if (node.type === 'leaf') {
    return 1
  }
  return countTerminalLayoutLeaves(node.first) + countTerminalLayoutLeaves(node.second)
}

export function getActivationSpawnSuppression(
  layout: TerminalLayoutSnapshot | undefined
): true | number {
  const paneCount = Math.max(
    1,
    countTerminalLayoutLeaves(layout?.root),
    Object.keys(layout?.ptyIdsByLeafId ?? {}).length
  )
  return paneCount === 1 ? true : paneCount
}

export function shouldDeferActivationTerminalPrep(): boolean {
  return typeof window !== 'undefined' && import.meta.env.MODE !== 'test'
}

export function publishLocalBaseRefRefreshResult(
  result: LocalBaseRefRefreshResult | undefined
): void {
  if (!result || result.status === 'updated') {
    return
  }
  publishRendererCommandResult({ type: 'worktree-local-base-ref-refresh', result })
}
