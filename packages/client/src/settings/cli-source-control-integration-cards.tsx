import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  ArrowSquareOut as ExternalLink,
  GithubLogo as Github,
  Terminal
} from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'

import {
  useIntegrationCommandRowClass,
  useIntegrationSubordinateRowClass
} from './integration-card-presentation'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { getProviderAccountScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './provider-host-scope-control'
import { usePreflightCardStatuses } from './source-control/preflight-card-status'

function ProviderAccountScopeDetails({
  children
}: {
  children?: React.ReactNode
}): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const accountScope = getProviderAccountScope(settings)
  const subordinateRowClass = useIntegrationSubordinateRowClass('text-xs')

  return (
    <IntegrationCardDetails>
      <ProviderHostScopeControl
        labelPrefix={translate(
          'auto.components.settings.cli.source.control.integration.cards.account_scope_prefix',
          'Account scope'
        )}
        scope={accountScope}
        className={subordinateRowClass}
      />
      {children}
    </IntegrationCardDetails>
  )
}

export function GitHubIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('gh')
  const status = unavailable ? 'unavailable' : statuses.ghStatus
  const connected = status === 'connected'
  const commandRowClass = useIntegrationCommandRowClass()

  return (
    <IntegrationCardShell
      icon={<Github className="size-5" />}
      name="GitHub"
      description={translate(
        'auto.components.settings.cli.source.control.integration.cards.githubDescription',
        'Pull requests and checks via the GitHub CLI.'
      )}
      checking={status === 'checking'}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={
        connected
          ? 'Connected'
          : status === 'unavailable'
            ? 'Unavailable'
            : status === 'not-installed'
              ? 'Not installed'
              : 'Not authenticated'
      }
    >
      <ProviderAccountScopeDetails>
        {status !== 'checking' && !connected ? (
          status === 'unavailable' ? (
            <>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.6f30fc4216',
                  'GitHub CLI status is not available in this runtime yet.'
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={refresh}>
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                  'Re-check'
                )}
              </Button>
            </>
          ) : status === 'not-installed' ? (
            <>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.23cb5a0dee',
                  'Install the GitHub CLI to enable pull requests and checks.'
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) => openHttpLink('https://cli.github.com', { event })}
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.7755c28af5',
                    'Install GitHub CLI'
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                    'Re-check'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.2e44dda68a',
                  'The GitHub CLI is installed but not authenticated. Run this command in a terminal:'
                )}
              </p>
              <div className={commandRowClass}>
                <Terminal className="text-muted-foreground size-3.5 shrink-0" />
                {translate(
                  'auto.components.settings.cli.source.control.integration.cards.8d90249d22',
                  'gh auth login'
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) =>
                    openHttpLink('https://cli.github.com/manual/gh_auth_login', { event })
                  }
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.8cbc39f862',
                    'Learn more'
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {translate(
                    'auto.components.settings.cli.source.control.integration.cards.d5b3be8ecd',
                    'Re-check'
                  )}
                </Button>
              </div>
            </>
          )
        ) : null}
      </ProviderAccountScopeDetails>
    </IntegrationCardShell>
  )
}
