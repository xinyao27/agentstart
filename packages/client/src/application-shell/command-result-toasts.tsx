import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  registerRendererCommandResultPresenter,
  type RendererCommandResult
} from '~renderer/runtime/renderer-command-result-channel'
import { resolveRemoteOperationErrorMessage } from '~renderer/source-control/remote-error'
import { useAppStore } from '~renderer/store/state'

import { presentAgentStartProfileResult } from '../agentstart-profiles/result-toasts'
import { showLocalBaseRefUpdateSuggestionToast } from '../sidebar/local-base-ref-suggestion-toast'
import { showPreservedBranchToast } from '../sidebar/preserved-branch-toast'

const ERROR_TOAST_DURATION = 60_000

export function installRendererCommandToasts(): void {
  registerRendererCommandResultPresenter(presentRendererCommandResult)
}

function presentRendererCommandResult(result: RendererCommandResult): void {
  switch (result.type) {
    case 'sparse-preset':
      presentSparsePresetResult(result)
      return
    case 'runtime-environment-switch-failed':
      toast.error(translate('auto.store.slices.settings.e12dab333b', 'Failed to switch hosts'), {
        description: result.error
      })
      return
    case 'agentstart-profile':
      presentAgentStartProfileResult(result)
      return
    case 'worktree-local-base-ref-refresh':
      presentLocalBaseRefRefresh(result.result)
      return
    case 'worktree-local-base-ref-suggestion': {
      const state = useAppStore.getState()
      showLocalBaseRefUpdateSuggestionToast(result.suggestion, {
        updateSettings: state.updateSettings,
        getSettings: () => useAppStore.getState().settings,
        openSettingsPage: state.openSettingsPage,
        openSettingsTarget: state.openSettingsTarget
      })
      return
    }
    case 'worktree-runtime-scope-forbidden':
      toast.error(
        translate(
          'auto.store.slices.worktrees.runtimeScopeForbiddenTitle',
          'This connection has limited (mobile) access'
        ),
        {
          id: 'runtime-scope-forbidden',
          description: translate(
            'auto.store.slices.worktrees.runtimeScopeForbiddenDescription',
            'Workspaces are unavailable on a mobile-scope connection. Connect through a full-access daemon to use the workbench.'
          )
        }
      )
      return
    case 'worktree-preserved-branch':
      showPreservedBranchToast(result.result, result.worktree, (branch, expectedHead) => {
        void useAppStore
          .getState()
          .forceDeletePreservedBranch(result.worktreeId, branch, expectedHead)
      })
      return
    case 'worktree-branch-delete':
      presentWorktreeBranchDelete(result)
      return
    case 'repository-cross-profile-duplicate':
      toast.warning(
        translate('auto.store.slices.repos.2dcd706774', 'Project also exists in another profile'),
        { description: result.description }
      )
      return
    case 'repository-import-failed':
      toast.error(
        translate('auto.store.slices.repos.6d3318e813', 'Failed to import repositories'),
        { description: result.error }
      )
      return
    case 'repository-runtime-folder-unavailable':
      toast.error(
        translate('auto.store.slices.repos.3be0f7df04', 'Cannot open folder on selected runtime'),
        {
          description: translate(
            'auto.store.slices.repos.15cf5319ec',
            '{{path}} was checked on {{hostName}}, but that host did not report a usable folder.',
            { path: result.path, hostName: result.hostName }
          ),
          duration: ERROR_TOAST_DURATION
        }
      )
      return
    case 'repository-add':
      presentRepositoryAdd(result)
      return
    case 'repository-add-route-required':
      toast.error(
        translate(
          'auto.store.slices.repos.e649269645',
          'Use Add Project to enter a path on the selected host.'
        )
      )
      return
    case 'repository-folder-add-failed':
      toast.error(translate('auto.store.slices.repos.b7e14472ae', 'Failed to add folder'), {
        description: result.error,
        duration: ERROR_TOAST_DURATION
      })
      return
    case 'editor-markdown-create-failed':
      toast.error(result.error)
      return
    case 'source-control-remote-operation-failed':
      toast.error(resolveRemoteOperationErrorMessage(result.error, result.context))
      return
    case 'editor-link-open-failed':
      toast.error(
        result.reason === 'missing'
          ? translate('auto.store.slices.editor.f2e00db373', 'File not found: {{value0}}', {
              value0: result.path
            })
          : translate('auto.store.slices.editor.51f15c37d3', 'Cannot open directory: {{value0}}', {
              value0: result.path
            })
      )
      return
    case 'agent-note-send':
      toast[result.outcome === 'succeeded' ? 'success' : 'error'](
        result.outcome === 'succeeded'
          ? translate('auto.store.slices.ui.66e3bd7ce6', 'Sent to {{value0}}', {
              value0: result.label
            })
          : translate('auto.store.slices.ui.53883b7bc3', "Couldn't send to {{value0}}", {
              value0: result.label
            }),
        result.error ? { description: result.error } : undefined
      )
  }
}

function presentSparsePresetResult(
  result: Extract<RendererCommandResult, { type: 'sparse-preset' }>
): void {
  const operationLabel = result.operation === 'update' ? 'update' : 'save'
  if (result.outcome === 'succeeded') {
    toast.success(
      result.operation === 'remove'
        ? translate('auto.store.slices.sparse.presets.ee434d7941', 'Preset removed')
        : result.operation === 'update'
          ? translate('auto.store.slices.sparse.presets.e10f097822', 'Preset updated')
          : translate('auto.store.slices.sparse.presets.0696d13e56', 'Preset saved'),
      result.name ? { description: result.name } : undefined
    )
    return
  }
  const title =
    result.operation === 'remove'
      ? translate('auto.store.slices.sparse.presets.6ed7d6010a', 'Failed to remove preset')
      : operationLabel === 'update'
        ? translate('auto.store.slices.sparse.presets.811be06b57', 'Failed to update preset')
        : translate('auto.store.slices.sparse.presets.c96b770172', 'Failed to save preset')
  toast.error(title, {
    description:
      result.outcome === 'blocked'
        ? translate(
            'auto.store.slices.sparse.presets.ef13e994e6',
            'Presets must load before saving.'
          )
        : result.error,
    duration: ERROR_TOAST_DURATION
  })
}

function presentLocalBaseRefRefresh(
  result: Extract<RendererCommandResult, { type: 'worktree-local-base-ref-refresh' }>['result']
): void {
  if (result.status === 'updated') {
    return
  }
  const reason =
    result.status === 'skipped_dirty_worktree'
      ? 'the worktree where it is checked out has uncommitted changes. Commit, stash, or discard those changes, then try again.'
      : result.status === 'skipped_not_fast_forward'
        ? 'the local branch does not exist or cannot be fast-forwarded cleanly from the remote base. Check for local-only commits before updating it manually.'
        : 'Git returned an error while updating the local ref. Check the repo for locked refs or unusual worktree state, then try again.'
  toast.warning(
    translate('auto.store.slices.worktrees.14bc053a47', 'Local {{value0}} was not refreshed', {
      value0: result.localBranch
    }),
    {
      description: translate(
        'auto.store.slices.worktrees.903b51c2ed',
        'Workspace created from {{value0}}, but AgentStart could not fast-forward local {{value1}} because {{value2}}',
        { value0: result.baseRef, value1: result.localBranch, value2: reason }
      )
    }
  )
}

function presentWorktreeBranchDelete(
  result: Extract<RendererCommandResult, { type: 'worktree-branch-delete' }>
): void {
  if (result.outcome === 'failed') {
    toast.error(translate('auto.store.slices.worktrees.0216895fb5', 'Failed to delete branch'), {
      description: result.error
    })
    return
  }
  toast.success(translate('auto.store.slices.worktrees.19db0085fb', 'Local branch deleted'), {
    description: translate('auto.store.slices.worktrees.5a58e03a26', 'Deleted "{{value0}}".', {
      value0: result.branchName
    })
  })
}

function presentRepositoryAdd(
  result: Extract<RendererCommandResult, { type: 'repository-add' }>
): void {
  if (result.outcome === 'failed') {
    toast.error(translate('auto.store.slices.repos.c6e022ddfc', 'Failed to add project'), {
      description: result.error,
      duration: ERROR_TOAST_DURATION
    })
    return
  }
  if (result.outcome === 'already-added') {
    toast.info(translate('auto.store.slices.repos.a8e4b3af5b', 'Project already added'), {
      description: result.displayName
    })
    return
  }
  toast.success(
    result.projectKind === 'folder'
      ? translate('auto.store.slices.repos.90d129b48b', 'Folder added')
      : translate('auto.store.slices.repos.8bb3ad7935', 'Project added'),
    { description: result.displayName }
  )
}
