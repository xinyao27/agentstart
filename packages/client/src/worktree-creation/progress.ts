import { translate } from '~renderer/i18n/i18n'
import type { PendingWorktreeCreation } from '~renderer/worktree-creation/pending'

export type WorktreeCreationStep = {
  id: 'base' | 'worktree' | 'files' | 'setup' | 'workspace'
  label: string
  state: 'complete' | 'active' | 'pending'
}

export function getWorktreeCreationSteps(
  entry: Pick<PendingWorktreeCreation, 'copiedFileCount' | 'phase' | 'setupConfigured'>
): WorktreeCreationStep[] {
  const activeIndex = getPhaseStepIndex(entry.phase)
  const labels = [
    translate('auto.components.worktree.creation.progress.prepareBase', 'Prepare base branch'),
    translate('auto.components.worktree.creation.progress.createWorktree', 'Create worktree'),
    entry.copiedFileCount === undefined
      ? translate(
          'auto.components.worktree.creation.progress.copyEnvironment',
          'Copy environment files'
        )
      : translate(
          'auto.components.worktree.creation.progress.copiedEnvironment',
          'Copied {{count}} environment files',
          { count: entry.copiedFileCount }
        ),
    entry.setupConfigured === false
      ? translate(
          'auto.components.worktree.creation.progress.noSetup',
          'No setup script configured'
        )
      : translate('auto.components.worktree.creation.progress.runSetup', 'Run setup script'),
    translate('auto.components.worktree.creation.progress.startWorkspace', 'Start workspace')
  ]
  const ids: WorktreeCreationStep['id'][] = ['base', 'worktree', 'files', 'setup', 'workspace']
  return ids.map((id, index) => ({
    id,
    label: labels[index] ?? '',
    state: index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'pending'
  }))
}

function getPhaseStepIndex(phase: PendingWorktreeCreation['phase']): number {
  switch (phase) {
    case 'preparing':
    case 'fetching':
      return 0
    case 'creating':
      return 1
    case 'copying-files':
      return 2
    case 'checking-setup':
    case 'running-setup':
      return 3
    case 'starting-workspace':
      return 4
  }
}

export type WorktreeCreateProgressPhase =
  | 'preparing'
  | 'fetching'
  | 'creating'
  | 'copying-files'
  | 'checking-setup'
  | 'running-setup'
  | 'starting-workspace'

export type WorktreeCreateProgressEvent = {
  type: 'worktreeCreateProgress'
  operationId?: string
  repoId: string
  phase: WorktreeCreateProgressPhase
  copiedFileCount?: number
  setupCommand?: string
  setupConfigured?: boolean
}
