import type { GitHistoryItem } from '@yiru/protocol/git/history-types'
import type React from 'react'
import type { WebLinkMouseEvent } from '~renderer/browser/link-gesture'
import { translate } from '~renderer/i18n/i18n'
import {
  ArrowsMerge,
  ArrowUUpLeft,
  Copy,
  GitBranch,
  GitCommit,
  Globe,
  Hash,
  Rewind,
  SignIn,
  Sparkle as Sparkles,
  Stack,
  Tag,
  TextAa,
  Trash
} from '~renderer/icons/hugeicons'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '~renderer/ui/context-menu'

import type { GitGraphCommitAction } from './commit-write-action'

// Why: mirrors vscode-git-graph's commit menu — the ref-moving and
// history-rewriting entries run through use-commit-write-actions.ts, which
// confirms (or collects options) before touching the repo.
export function GitGraphCommitContextMenu({
  item,
  onAction
}: {
  item: GitHistoryItem
  onAction: (action: GitGraphCommitAction, item: GitHistoryItem, event?: WebLinkMouseEvent) => void
}): React.JSX.Element {
  // Why: nowrap + content-sized width — the longest entries ("Rebase current
  // branch on this Commit…") wrapped to two lines at a fixed menu width.
  return (
    <ContextMenuContent className="w-auto whitespace-nowrap">
      <ContextMenuItem onClick={() => onAction('add-tag', item)}>
        <Tag className="size-3.5" />
        {translate('auto.components.workspace-panel.git-graph.CommitMenu.addTag', 'Add Tag…')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('create-branch', item)}>
        <GitBranch className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitMenu.createBranch',
          'Create Branch…'
        )}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onAction('checkout', item)}>
        <SignIn className="size-3.5" />
        {translate('auto.components.workspace-panel.git-graph.CommitMenu.checkout', 'Checkout…')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('cherry-pick', item)}>
        <GitCommit className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitMenu.cherryPick',
          'Cherry Pick…'
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('revert', item)}>
        <ArrowUUpLeft className="size-3.5" />
        {translate('auto.components.workspace-panel.git-graph.CommitMenu.revert', 'Revert…')}
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onClick={() => onAction('drop', item)}>
        <Trash className="size-3.5" />
        {translate('auto.components.workspace-panel.git-graph.CommitMenu.drop', 'Drop…')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onAction('merge', item)}>
        <ArrowsMerge className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitMenu.merge',
          'Merge into current branch…'
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('rebase', item)}>
        <Stack className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitMenu.rebase',
          'Rebase current branch on this Commit…'
        )}
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onClick={() => onAction('reset', item)}>
        <Rewind className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitMenu.reset',
          'Reset current branch to this Commit…'
        )}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={(event) => onAction('open-remote', item, event)}>
        <Globe className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitContextMenu.a1b2c3d4e5',
          'Open commit in browser'
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('copy-hash', item)}>
        <Hash className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitContextMenu.b2c3d4e5f6',
          'Copy commit hash'
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('copy-subject', item)}>
        <TextAa className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitMenu.copySubject',
          'Copy commit subject'
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('copy-message', item)}>
        <Copy className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitContextMenu.c3d4e5f6a7',
          'Copy commit message'
        )}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onAction('explain', item)}>
        <Sparkles className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitContextMenu.d4e5f6a7b8',
          'Explain changes'
        )}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
