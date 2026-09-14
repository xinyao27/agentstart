import type { FileTreeRowDecoration } from '@pierre/trees'
import { translate } from '~renderer/i18n/i18n'

import type { SourceControlController } from './controller'
import { SUBMODULE_WORKTREE_ONLY_LABEL } from './panel-constants'
import type { SourceControlPierreTarget } from './pierre-tree-data'

// Why: Pierre exports the colored-part type only from a subpath its package
// `exports` map does not publish, so derive it from the decoration union.
type FileTreeRowDecorationTextPart = NonNullable<
  Extract<FileTreeRowDecoration, { text: string }>['parts']
>[number]

function getEntryDecorationParts(
  target: Extract<SourceControlPierreTarget, { kind: 'uncommitted' | 'branch' }>,
  commentCount: number
): FileTreeRowDecorationTextPart[] {
  const parts: FileTreeRowDecorationTextPart[] = []
  if (target.kind === 'uncommitted' && target.entry.conflictStatus) {
    parts.push({
      text:
        target.entry.conflictStatus === 'unresolved'
          ? translate('auto.components.workspacePanel.SourceControl.31f6d46278', 'Unresolved')
          : translate('auto.components.workspacePanel.SourceControl.2c417432b7', 'Resolved locally')
    })
  }
  if (
    target.kind === 'uncommitted' &&
    target.entry.submoduleRoot === undefined &&
    target.entry.submodule?.commitChanged === false &&
    (target.entry.submodule.trackedChanges || target.entry.submodule.untrackedChanges)
  ) {
    parts.push({ text: SUBMODULE_WORKTREE_ONLY_LABEL })
  }
  if (commentCount > 0) {
    parts.push({
      text: translate(
        'auto.components.workspacePanel.SourceControl.657e0c90ad',
        '{{value0}} note{{value1}}',
        { value0: commentCount, value1: commentCount === 1 ? '' : 's' }
      )
    })
  }
  if (typeof target.entry.added === 'number' && target.entry.added > 0) {
    parts.push({ text: `+${target.entry.added}`, color: 'var(--trees-git-added-color)' })
  }
  if (typeof target.entry.removed === 'number' && target.entry.removed > 0) {
    parts.push({ text: `-${target.entry.removed}`, color: 'var(--trees-git-deleted-color)' })
  }
  if (target.entry.status === 'copied') {
    parts.push({ text: 'C', color: 'var(--git-decoration-copied)' })
  }
  return parts
}

function getDecorationParts(
  target: SourceControlPierreTarget | undefined,
  controller: SourceControlController
): FileTreeRowDecorationTextPart[] {
  if (!target || target.kind === 'directory' || target.kind === 'placeholder') {
    return []
  }
  return getEntryDecorationParts(
    target,
    controller.diffCommentCountByPath.get(target.entry.path) ?? 0
  )
}

export function getSourceControlPierreRowDecoration(
  target: SourceControlPierreTarget | undefined,
  controller: SourceControlController
): FileTreeRowDecoration | null {
  if (target?.kind === 'placeholder') {
    return { text: '', title: target.message }
  }
  const parts = getDecorationParts(target, controller)
  if (parts.length === 0) {
    return null
  }
  return {
    text: parts.map((part) => part.text).join(' '),
    title: parts.map((part) => part.text).join(' · '),
    // Why: Pierre renders one span per part with the part's color, so additions
    // and removals keep their source-control colors through the public API.
    // Spacing rides in the text because the parts share one flow container.
    parts: parts.map((part, index) => (index === 0 ? part : { ...part, text: ` ${part.text}` }))
  }
}
