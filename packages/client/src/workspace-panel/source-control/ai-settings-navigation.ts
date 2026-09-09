import type { Repo } from '@yiru/protocol/project/repository'
import { getRepositorySourceControlAiSectionId } from '~renderer/settings/repository/settings-targets'
import type { AppState } from '~renderer/store/state'

export function openSourceControlAiSettingsTarget({
  activeRepo,
  openSettingsTarget,
  openSettingsPage
}: {
  activeRepo: Repo | null
  openSettingsTarget: AppState['openSettingsTarget']
  openSettingsPage: AppState['openSettingsPage']
}): void {
  if (activeRepo) {
    openSettingsTarget({
      pane: 'repo',
      repoId: activeRepo.id,
      sectionId: getRepositorySourceControlAiSectionId(activeRepo.id)
    })
  } else {
    openSettingsTarget({
      pane: 'git',
      repoId: null,
      sectionId: 'source-control-ai-settings'
    })
  }
  openSettingsPage()
}
