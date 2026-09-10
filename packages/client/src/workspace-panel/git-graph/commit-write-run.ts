import type { GitHistoryItem } from '@agentstart/protocol/git/history-types'
import { translate } from '~renderer/i18n/i18n'
import {
  addRuntimeGitTag,
  checkoutRuntimeGitCommit,
  cherryPickRuntimeGitCommit,
  createRuntimeGitBranchFromCommit,
  dropRuntimeGitCommit,
  mergeRuntimeGitCommit,
  rebaseRuntimeGitOntoCommit,
  resetRuntimeGitToCommit,
  revertRuntimeGitCommit,
  type RuntimeGitContext
} from '~renderer/runtime/git-client'

import type { GitGraphCommitWriteAction, GitGraphCommitWriteForm } from './commit-write-action'

// Why: every git write op already reports the same four outcomes (see
// shared/git/write-op-results.ts); this collapses them to one shape carrying
// the success sentence too, so the caller has a single toast switch.
export type GitGraphCommitWriteOutcome =
  | { status: 'ok'; message: string }
  | { status: 'conflicts'; paths: string[] }
  | { status: 'blocked'; message: string }
  | { status: 'error'; message: string }

function commitLabel(item: GitHistoryItem): string {
  return item.displayId ?? item.id.slice(0, 7)
}

// Why: cherry-pick/revert only accept `-m` for a merge commit — passing it for
// a single-parent commit makes git fail outright.
function mainlineFor(item: GitHistoryItem, form: GitGraphCommitWriteForm): number | undefined {
  return item.parentIds.length > 1 ? form.mainline : undefined
}

export async function runGitGraphCommitWrite(
  context: RuntimeGitContext,
  action: GitGraphCommitWriteAction,
  item: GitHistoryItem,
  form: GitGraphCommitWriteForm
): Promise<GitGraphCommitWriteOutcome> {
  const commit = commitLabel(item)
  switch (action) {
    case 'add-tag': {
      const result = await addRuntimeGitTag(context, {
        name: form.name.trim(),
        commit: item.id,
        message: form.annotation.trim() || undefined,
        force: form.force
      })
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: translate(
          'auto.components.workspace-panel.git-graph.CommitWriteRun.tagOk',
          'Tag {{name}} created',
          { name: result.tag }
        )
      }
    }
    case 'create-branch': {
      const result = await createRuntimeGitBranchFromCommit(context, {
        name: form.name.trim(),
        commit: item.id,
        checkout: form.checkout
      })
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: result.checkedOut
          ? translate(
              'auto.components.workspace-panel.git-graph.CommitWriteRun.branchCheckedOut',
              'Branch {{name}} created and checked out',
              { name: result.branch }
            )
          : translate(
              'auto.components.workspace-panel.git-graph.CommitWriteRun.branchOk',
              'Branch {{name}} created',
              { name: result.branch }
            )
      }
    }
    case 'checkout': {
      const result = await checkoutRuntimeGitCommit(context, item.id)
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: translate(
          'auto.components.workspace-panel.git-graph.CommitWriteRun.checkoutOk',
          'Checked out {{commit}}',
          { commit }
        )
      }
    }
    case 'cherry-pick': {
      const result = await cherryPickRuntimeGitCommit(context, {
        commit: item.id,
        mainline: mainlineFor(item, form)
      })
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: translate(
          'auto.components.workspace-panel.git-graph.CommitWriteRun.cherryPickOk',
          'Cherry picked {{commit}}',
          { commit }
        )
      }
    }
    case 'revert': {
      const result = await revertRuntimeGitCommit(context, {
        commit: item.id,
        mainline: mainlineFor(item, form)
      })
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: translate(
          'auto.components.workspace-panel.git-graph.CommitWriteRun.revertOk',
          'Reverted {{commit}}',
          { commit }
        )
      }
    }
    case 'drop': {
      const result = await dropRuntimeGitCommit(context, item.id)
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: translate(
          'auto.components.workspace-panel.git-graph.CommitWriteRun.dropOk',
          'Dropped {{commit}}',
          { commit }
        )
      }
    }
    case 'merge': {
      const result = await mergeRuntimeGitCommit(context, {
        commit: item.id,
        noFf: form.noFf,
        squash: form.squash
      })
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: translate(
          'auto.components.workspace-panel.git-graph.CommitWriteRun.mergeOk',
          'Merged {{commit}} into the current branch',
          { commit }
        )
      }
    }
    case 'rebase': {
      const result = await rebaseRuntimeGitOntoCommit(context, item.id)
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: translate(
          'auto.components.workspace-panel.git-graph.CommitWriteRun.rebaseOk',
          'Rebased the current branch onto {{commit}}',
          { commit }
        )
      }
    }
    case 'reset': {
      const result = await resetRuntimeGitToCommit(context, {
        commit: item.id,
        mode: form.resetMode
      })
      if (result.status !== 'ok') {
        return result
      }
      return {
        status: 'ok',
        message: translate(
          'auto.components.workspace-panel.git-graph.CommitWriteRun.resetOk',
          'Reset the current branch to {{commit}}',
          { commit }
        )
      }
    }
  }
}
