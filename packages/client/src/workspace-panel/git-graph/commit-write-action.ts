import type { GitHistoryItem } from '@yiru/protocol/git/history-types'
import { translate } from '~renderer/i18n/i18n'

import type { GitHistoryCommitAction } from '../git-history-commit-context-menu'

// Why: the write half of the commit context menu — everything that moves refs
// or rewrites history. Kept apart from the read-only actions in
// use-git-history-commit-actions.ts because these need a confirmation or an
// options form before they may run.
export type GitGraphCommitWriteAction =
  | 'add-tag'
  | 'create-branch'
  | 'checkout'
  | 'cherry-pick'
  | 'revert'
  | 'drop'
  | 'merge'
  | 'rebase'
  | 'reset'

export type GitGraphCommitAction =
  | GitHistoryCommitAction
  | 'copy-subject'
  | GitGraphCommitWriteAction

export type GitGraphCommitWriteField =
  | 'name'
  | 'annotation'
  | 'force'
  | 'checkout'
  | 'no-ff'
  | 'squash'
  | 'reset-mode'
  | 'mainline'

export type GitGraphResetMode = 'soft' | 'mixed' | 'hard'

export type GitGraphCommitWriteForm = {
  name: string
  annotation: string
  force: boolean
  checkout: boolean
  noFf: boolean
  squash: boolean
  resetMode: GitGraphResetMode
  // 1-based parent index for `-m`, as git numbers a merge commit's parents.
  mainline: number
}

export const EMPTY_GIT_GRAPH_COMMIT_WRITE_FORM: GitGraphCommitWriteForm = {
  name: '',
  annotation: '',
  force: false,
  checkout: false,
  noFf: false,
  squash: false,
  resetMode: 'mixed',
  mainline: 1
}

export type GitGraphCommitWritePrompt = {
  title: string
  description: string
  confirmLabel: string
  destructive: boolean
  fields: GitGraphCommitWriteField[]
}

export function isGitGraphCommitWriteAction(
  action: GitGraphCommitAction
): action is GitGraphCommitWriteAction {
  return (
    action === 'add-tag' ||
    action === 'create-branch' ||
    action === 'checkout' ||
    action === 'cherry-pick' ||
    action === 'revert' ||
    action === 'drop' ||
    action === 'merge' ||
    action === 'rebase' ||
    action === 'reset'
  )
}

function commitLabel(item: GitHistoryItem): string {
  return item.displayId ?? item.id.slice(0, 7)
}

// Why: cherry-pick and revert must name a mainline parent for a merge commit
// (`git cherry-pick -m`/`git revert -m`), which git refuses to guess.
function mainlineFields(item: GitHistoryItem): GitGraphCommitWriteField[] {
  return item.parentIds.length > 1 ? ['mainline'] : []
}

export function describeGitGraphCommitWrite(
  action: GitGraphCommitWriteAction,
  item: GitHistoryItem
): GitGraphCommitWritePrompt {
  const commit = commitLabel(item)
  switch (action) {
    case 'add-tag':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.tagTitle',
          'Add tag'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.tagBody',
          'Create a tag pointing at commit {{commit}}.',
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.tagConfirm',
          'Add Tag'
        ),
        destructive: false,
        fields: ['name', 'annotation', 'force']
      }
    case 'create-branch':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.branchTitle',
          'Create branch'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.branchBody',
          'Create a branch pointing at commit {{commit}}.',
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.branchConfirm',
          'Create Branch'
        ),
        destructive: false,
        fields: ['name', 'checkout']
      }
    case 'checkout':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.checkoutTitle',
          'Check out commit?'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.checkoutBody',
          'Check out {{commit}} directly. This leaves the worktree on a detached HEAD until you check out a branch again.',
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.checkoutConfirm',
          'Checkout'
        ),
        destructive: false,
        fields: []
      }
    case 'cherry-pick':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.cherryPickTitle',
          'Cherry pick commit?'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.cherryPickBody',
          'Apply the changes from {{commit}} on top of the current branch.',
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.cherryPickConfirm',
          'Cherry Pick'
        ),
        destructive: false,
        fields: mainlineFields(item)
      }
    case 'revert':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.revertTitle',
          'Revert commit?'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.revertBody',
          'Add a new commit on the current branch that undoes the changes in {{commit}}.',
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.revertConfirm',
          'Revert'
        ),
        destructive: false,
        fields: mainlineFields(item)
      }
    case 'drop':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.dropTitle',
          'Drop commit?'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.dropBody',
          'Rewrite the current branch to remove {{commit}}. Commits after it get new hashes, so anything already sharing them will need to be updated.',
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.dropConfirm',
          'Drop Commit'
        ),
        destructive: true,
        fields: []
      }
    case 'merge':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.mergeTitle',
          'Merge into current branch'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.mergeBody',
          'Merge {{commit}} into the branch checked out in this worktree.',
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.mergeConfirm',
          'Merge'
        ),
        destructive: false,
        fields: ['no-ff', 'squash']
      }
    case 'rebase':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.rebaseTitle',
          'Rebase current branch on commit?'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.rebaseBody',
          "Replay the current branch's commits on top of {{commit}}. The replayed commits get new hashes.",
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.rebaseConfirm',
          'Rebase'
        ),
        destructive: true,
        fields: []
      }
    case 'reset':
      return {
        title: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.resetTitle',
          'Reset current branch to commit'
        ),
        description: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.resetBody',
          'Move the current branch to {{commit}}. A hard reset also discards uncommitted changes.',
          { commit }
        ),
        confirmLabel: translate(
          'auto.components.workspace-panel.git-graph.CommitWrite.resetConfirm',
          'Reset'
        ),
        destructive: true,
        fields: ['reset-mode']
      }
  }
}

export function isGitGraphCommitWriteFormValid(
  prompt: GitGraphCommitWritePrompt,
  form: GitGraphCommitWriteForm
): boolean {
  return !prompt.fields.includes('name') || form.name.trim().length > 0
}
