import type { Repo } from '@yiru/protocol/project/repository'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import { translate } from '~renderer/i18n/i18n'

export type RepoHeaderCreateState = {
  disabled: boolean
  tooltip: string
  ariaLabel: string
}

// Why: this used to gate creation on repo.connectionId (an SSH reconnect
// prompt), but Repo.connectionId is dead — nothing sets it since remote hosts
// were removed (#63) — so that branch never ran. Only the non-git and git
// states remain reachable.
export function getRepoHeaderCreateState(input: {
  repo: Repo
  label: string
}): RepoHeaderCreateState {
  if (!isGitRepoKind(input.repo)) {
    return {
      disabled: false,
      tooltip: translate(
        'auto.components.sidebar.repo.header.create.state.62e71f2d5d',
        'Create workspace for {{value0}}',
        { value0: input.label }
      ),
      ariaLabel: translate(
        'auto.components.sidebar.repo.header.create.state.62e71f2d5d',
        'Create workspace for {{value0}}',
        { value0: input.label }
      )
    }
  }

  return {
    disabled: false,
    tooltip: translate(
      'auto.components.sidebar.repo.header.create.state.992cfbc44b',
      'Create new worktree for {{value0}}',
      { value0: input.label }
    ),
    ariaLabel: translate(
      'auto.components.sidebar.repo.header.create.state.992cfbc44b',
      'Create new worktree for {{value0}}',
      { value0: input.label }
    )
  }
}
