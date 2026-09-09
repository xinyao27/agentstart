import type { WorkspaceStatusDefinition } from '@yiru/protocol/workspace/status/model'
import { translate } from '~renderer/i18n/i18n'

export function workspaceStatusLabel(status: WorkspaceStatusDefinition): string {
  if (status.id === 'todo' && status.label === 'Todo') {
    return translate('workspaceStatus.todo', 'Todo')
  }
  if (status.id === 'in-progress' && status.label === 'In progress') {
    return translate('workspaceStatus.inProgress', 'In progress')
  }
  if (status.id === 'in-review' && status.label === 'In review') {
    return translate('workspaceStatus.inReview', 'In review')
  }
  if (status.id === 'completed' && (status.label === 'Completed' || status.label === 'Done')) {
    return translate('workspaceStatus.done', 'Done')
  }
  return status.label
}
