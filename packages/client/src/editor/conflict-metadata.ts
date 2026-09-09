import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import { translate } from '~renderer/i18n/i18n'

import type { OpenConflictMetadata } from './file-model'

export function toOpenConflictMetadata(entry: GitStatusEntry): OpenConflictMetadata | undefined {
  if (!entry.conflictKind || !entry.conflictStatus || !entry.conflictStatusSource) {
    return undefined
  }
  if (entry.status !== 'deleted') {
    return {
      kind: 'conflict-editable',
      conflictKind: entry.conflictKind,
      conflictStatus: entry.conflictStatus,
      conflictStatusSource: entry.conflictStatusSource
    }
  }
  return {
    kind: 'conflict-placeholder',
    conflictKind: entry.conflictKind,
    conflictStatus: entry.conflictStatus,
    conflictStatusSource: entry.conflictStatusSource,
    message: translate(
      'auto.store.slices.editor.dcb521ed29',
      'This file is in a conflict state, but no working-tree file is available to edit.'
    ),
    guidance: 'Resolve the conflict in Git or restore one side before reopening it.'
  }
}
