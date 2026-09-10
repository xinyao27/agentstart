import { translate } from '~renderer/i18n/i18n'

import { BrowserAiSettings } from './browser-ai'
import { CommunityAdaptersSettings } from './community-adapters'
import { DangerousApprovalSettings } from './security'
import { TrustedSitesSettings } from './trusted-sites'

export function BrowserSettingsPane(): React.JSX.Element {
  return (
    <section className="space-y-3 pt-5">
      <div>
        <h1 className="text-xl font-semibold">
          {translate('extension.browserSettings.title', 'Browser settings')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {translate(
            'extension.browserSettings.description',
            'Preferences that only apply to AgentStart running inside this browser.'
          )}
        </p>
        <DangerousApprovalSettings />
        <BrowserAiSettings />
        <TrustedSitesSettings />
        <CommunityAdaptersSettings />
      </div>
    </section>
  )
}
