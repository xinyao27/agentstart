import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

import type { SettingsSearchEntry } from './search'
import { translateSearchKeyword } from './search-keywords'

export const getRuntimeEnvironmentsSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate(
      'auto.components.settings.runtime.environments.search.3517fb2ec0',
      'Remote Daemons'
    ),
    description: translate(
      'auto.components.settings.runtime.environments.search.4575341c77',
      'Manage configured remote daemons or choose the active runtime.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.d198440ce3',
        'runtime'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.ebd5369acf',
        'environment'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.09568ccc65',
        'host'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.d760866285',
        'remote daemon'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.5cd7dca3b8',
        'remote'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.104f4d7dbd',
        'authorization'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.45501ff2c3',
        'cloud'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.772e3b4753',
        'vm'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.runtime.environments.search.c6e5a03aa0',
        'dev box'
      )
    ]
  })
)
