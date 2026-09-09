import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'

import { GitHubRateLimitPanel } from '../github/rate-limit-display'
import { matchesSettingsSearch } from './search'
import { SearchableSetting } from './searchable-setting'

type GitProviderApiBudgetPaneProps = {
  settingsSearchQuery?: string
}

export function GitProviderApiBudgetPane({
  settingsSearchQuery
}: GitProviderApiBudgetPaneProps): React.JSX.Element | null {
  const storeSearchQuery = useAppStore((s) => s.settingsSearchQuery)
  const searchQuery = settingsSearchQuery ?? storeSearchQuery

  const visibleSections = [
    matchesSettingsSearch(searchQuery, {
      title: translate('auto.components.settings.GitPane.612a440e57', 'GitHub API Budget'),
      description: translate(
        'auto.components.settings.GitPane.aa204f185f',
        'Current GitHub CLI REST, Search, and GraphQL rate limits.'
      ),
      keywords: [
        translate('auto.components.settings.GitPane.32dca11189', 'github'),
        translate('auto.components.settings.GitPane.895d3f70b8', 'gh'),
        translate('auto.components.settings.GitPane.2cde9044a8', 'graphql'),
        translate('auto.components.settings.GitPane.b9c011fbc2', 'rate limit'),
        translate('auto.components.settings.GitPane.cdd793134e', 'api budget')
      ]
    }) ? (
      <SearchableSetting
        key="github-api-budget"
        title={translate('auto.components.settings.GitPane.612a440e57', 'GitHub API Budget')}
        description={translate(
          'auto.components.settings.GitPane.aa204f185f',
          'Current GitHub CLI REST, Search, and GraphQL rate limits.'
        )}
        keywords={['github', 'gh', 'graphql', 'rate limit', 'api budget']}
        className="space-y-3"
      >
        <GitHubRateLimitPanel />
      </SearchableSetting>
    ) : null
  ].filter(Boolean)

  if (visibleSections.length === 0) {
    return null
  }

  // Why: provider budgets are diagnostic, so they render after core git and AI
  // settings instead of competing with everyday branch and attribution controls.
  return <div className="border-border/40 space-y-4 border-t pt-4">{visibleSections}</div>
}
