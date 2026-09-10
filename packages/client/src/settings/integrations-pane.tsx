import { translate } from '~renderer/i18n/i18n'

import { GitHubIntegrationCard } from './source-control/integration-cards'
import { useIntegrationProviderStatusRefresh } from './use-integration-provider-status-refresh'
export function IntegrationsPane(): React.JSX.Element {
  useIntegrationProviderStatusRefresh()

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-foreground text-sm font-semibold">
            {translate('auto.components.settings.IntegrationsPane.298c65ecac', 'Review providers')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.IntegrationsPane.1683acbac4',
              'Connect GitHub for pull requests, checks, and review status.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          <GitHubIntegrationCard />
        </div>
      </section>
    </div>
  )
}
