import { translate } from '~renderer/i18n/i18n'
import { Gauge } from '~renderer/icons/hugeicons'

import { GitHubRateLimitPanel } from '../github/rate-limit-display'
import { SettingsGroupCards } from './group-card'

const GITHUB_API_BUDGET_SEARCH_ENTRY = () => ({
  title: translate('auto.components.settings.GitPane.612a440e57', 'GitHub API Budget'),
  description: translate(
    'auto.components.settings.GitPane.aa204f185f',
    'Current GitHub CLI REST, Search, and GraphQL rate limits.'
  ),
  keywords: ['github', 'gh', 'graphql', 'rate limit', 'api budget']
})

export function GitProviderApiBudgetPane(): React.JSX.Element {
  // Why: provider budgets are diagnostic, so they render after core git and AI
  // settings instead of competing with everyday branch and attribution controls.
  return (
    <SettingsGroupCards
      defaultOpenId={null}
      groups={[
        {
          id: 'git-api-budget',
          icon: <Gauge aria-hidden="true" />,
          title: translate('auto.components.settings.GitPane.612a440e57', 'GitHub API Budget'),
          summary: translate(
            'auto.components.settings.GitPane.aa204f185f',
            'Current GitHub CLI REST, Search, and GraphQL rate limits.'
          ),
          searchEntries: [GITHUB_API_BUDGET_SEARCH_ENTRY()],
          content: (
            <div className="py-3">
              <GitHubRateLimitPanel />
            </div>
          )
        }
      ]}
    />
  )
}
