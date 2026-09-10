import type {
  LocalBaseRefRefreshResult,
  LocalBaseRefUpdateSuggestion,
  RemoveWorktreeResult
} from '@agentstart/protocol/worktree/create-result'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { RemoteOperationErrorOptions } from '~renderer/source-control/remote-error'

export type RendererCommandResult =
  | {
      type: 'sparse-preset'
      operation: 'save' | 'update' | 'remove'
      outcome: 'succeeded' | 'failed' | 'blocked'
      name?: string
      error?: string
    }
  | { type: 'runtime-environment-switch-failed'; error: string }
  | {
      type: 'agentstart-profile'
      operation: 'create-local' | 'switch' | 'transfer'
      outcome: 'succeeded' | 'failed' | 'duplicate-target'
      error?: string
    }
  | { type: 'worktree-local-base-ref-refresh'; result: LocalBaseRefRefreshResult }
  | { type: 'worktree-local-base-ref-suggestion'; suggestion: LocalBaseRefUpdateSuggestion }
  | { type: 'worktree-runtime-scope-forbidden' }
  | {
      type: 'worktree-preserved-branch'
      worktreeId: string
      result: RemoveWorktreeResult
      worktree?: Pick<Worktree, 'id' | 'displayName' | 'isMainWorktree'>
    }
  | {
      type: 'worktree-branch-delete'
      outcome: 'succeeded' | 'failed'
      branchName: string
      error?: string
    }
  | { type: 'repository-cross-profile-duplicate'; description: string }
  | { type: 'repository-import-failed'; error: string }
  | { type: 'repository-runtime-folder-unavailable'; path: string; hostName: string }
  | {
      type: 'repository-add'
      outcome: 'added' | 'already-added' | 'failed'
      projectKind?: 'git' | 'folder'
      displayName?: string
      error?: string
    }
  | { type: 'repository-add-route-required' }
  | { type: 'repository-folder-add-failed'; error: string }
  | { type: 'editor-markdown-create-failed'; error: string }
  | {
      type: 'source-control-remote-operation-failed'
      error: unknown
      context?: RemoteOperationErrorOptions
    }
  | { type: 'editor-link-open-failed'; reason: 'missing' | 'directory'; path: string }
  | { type: 'agent-note-send'; outcome: 'succeeded' | 'failed'; label: string; error?: string }

type RendererCommandResultPresenter = (result: RendererCommandResult) => void

let presenter: RendererCommandResultPresenter | null = null
const pendingResults: RendererCommandResult[] = []

export function publishRendererCommandResult(result: RendererCommandResult): void {
  if (!presenter) {
    // Why: store actions can run during renderer bootstrap; preserve their
    // user-visible result until the stable presentation owner is installed.
    pendingResults.push(result)
    return
  }
  presenter(result)
}

export function registerRendererCommandResultPresenter(
  nextPresenter: RendererCommandResultPresenter
): void {
  presenter = nextPresenter
  for (const result of pendingResults.splice(0)) {
    nextPresenter(result)
  }
}
