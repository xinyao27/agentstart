import { isFolderRepo, type Repo } from '@yiru/protocol/project/repository'
import { translate } from '~renderer/i18n/i18n'

export function getRepoKindLabel(repo: Pick<Repo, 'kind'>): string {
  return isFolderRepo(repo)
    ? translate('project.kind.folder', 'Folder')
    : translate('project.kind.git', 'Git')
}
