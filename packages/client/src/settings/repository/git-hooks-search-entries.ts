import type { Repo } from '@yiru/protocol/project/repository'
import { translate } from '~renderer/i18n/i18n'

import type { SettingsSearchEntry } from '../search'
import { translateSearchKeyword } from '../search-keywords'

export function getRepositoryGitHooksSearchEntries(repo: Repo): SettingsSearchEntry[] {
  return [
    {
      title: translate('auto.components.settings.repository.search.b79df26937', 'Setup Script'),
      description: translate(
        'auto.components.settings.repository.search.baaf70bb37',
        'Local and shared scripts that run after a new worktree is created.'
      ),
      keywords: [
        repo.displayName,
        ...translateSearchKeyword('auto.components.settings.repository.search.8655e3387b', 'hooks'),
        ...translateSearchKeyword('auto.components.settings.repository.search.5590388dfa', 'setup'),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.a31b43a7f8',
          'setup script'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.491b05d6e6',
          'setup command'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.6b80f7d3c8',
          'local settings scripts'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.9cad92fe77',
          'yiru.yaml hooks'
        ),
        ...translateSearchKeyword('auto.components.settings.repository.search.bf460fded8', 'yaml')
      ]
    },
    {
      title: translate('auto.components.settings.repository.search.bce0ca23c6', 'Archive Script'),
      description: translate(
        'auto.components.settings.repository.search.acd1157f0c',
        'Local and shared scripts that run before a worktree is archived.'
      ),
      keywords: [
        repo.displayName,
        ...translateSearchKeyword('auto.components.settings.repository.search.8655e3387b', 'hooks'),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.4c17787d7b',
          'archive'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.fbfd2386e8',
          'archive script'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.a1a4c51d58',
          'archive command'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.6b80f7d3c8',
          'local settings scripts'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.9cad92fe77',
          'yiru.yaml hooks'
        ),
        ...translateSearchKeyword('auto.components.settings.repository.search.bf460fded8', 'yaml')
      ]
    },
    {
      title: translate('auto.components.settings.repository.search.cc11699c3d', 'Advanced'),
      description: translate(
        'auto.components.settings.repository.search.d141897c90',
        'Command source and yiru.yaml details.'
      ),
      keywords: [
        repo.displayName,
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.19f58d6d89',
          'advanced'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.ed269fad69',
          'command source'
        ),
        ...translateSearchKeyword('auto.components.settings.repository.search.0432d2fb7c', 'local'),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.603c68b68c',
          'yiru.yaml'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.fcb8fa8144',
          'shared'
        ),
        ...translateSearchKeyword('auto.components.settings.repository.search.1d90a6cfbb', 'both'),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.f1e1bfa89f',
          'source'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.5e9445bbfd',
          'authoritative'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.repository.search.cdfe398068',
        'When to Run Setup'
      ),
      description: translate(
        'auto.components.settings.repository.search.c00a549e03',
        'Choose the default behavior when a setup script is available.'
      ),
      keywords: [
        repo.displayName,
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.f9d84b7971',
          'setup run policy'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.waitForSetupBeforeAgent',
          'wait for setup before starting agent'
        ),
        ...translateSearchKeyword('auto.components.settings.repository.search.80c490b012', 'ask'),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.a69c5cbe90',
          'run by default'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.repository.search.c5e8bdbcbb',
          'skip by default'
        )
      ]
    }
  ]
}
