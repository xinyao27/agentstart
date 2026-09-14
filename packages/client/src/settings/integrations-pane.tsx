import { translate } from '~renderer/i18n/i18n'
import { GithubLogo } from '~renderer/icons/hugeicons'

import { SettingsGroupCards } from './group-card'
import { getIntegrationsPaneSearchEntries } from './integrations-search'
import { GitHubIntegrationCard } from './source-control/integration-cards'
import { useIntegrationProviderStatusRefresh } from './use-integration-provider-status-refresh'
export function IntegrationsPane(): React.JSX.Element {
  useIntegrationProviderStatusRefresh()

  return (
    <SettingsGroupCards
      defaultOpenId="integrations-review"
      groups={[
        {
          id: 'integrations-review',
          icon: <GithubLogo aria-hidden="true" />,
          title: translate(
            'auto.components.settings.IntegrationsPane.298c65ecac',
            'Review providers'
          ),
          summary: translate(
            'auto.components.settings.IntegrationsPane.1683acbac4',
            'Connect GitHub for pull requests, checks, and review status.'
          ),
          searchEntries: getIntegrationsPaneSearchEntries(),
          forceVisible: true,
          content: (
            <div className="py-2">
              <GitHubIntegrationCard />
            </div>
          )
        }
      ]}
    />
  )
}
