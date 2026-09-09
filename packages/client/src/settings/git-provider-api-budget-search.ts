import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

import { translateSearchKeyword } from './search-keywords'

export const getGitProviderApiBudgetSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.git.search.ff86e354c4', 'GitHub API Budget'),
    description: translate(
      'auto.components.settings.git.search.1139f61512',
      'Current GitHub CLI REST, Search, and GraphQL rate limits.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.git.search.d088806071', 'github'),
      ...translateSearchKeyword('auto.components.settings.git.search.16f53f7323', 'gh'),
      ...translateSearchKeyword('auto.components.settings.git.search.65b69d9f80', 'graphql'),
      ...translateSearchKeyword('auto.components.settings.git.search.b7e52124c7', 'rate limit'),
      ...translateSearchKeyword('auto.components.settings.git.search.40f9b815fd', 'api budget')
    ]
  }
])
