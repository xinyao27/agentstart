import { BrowserAiSettings } from './browser-ai'
import { CommunityAdaptersSettings } from './community-adapters'
import { DangerousApprovalSettings } from './security'
import { TrustedSitesSettings } from './trusted-sites'

export function BrowserSettingsPane(): React.JSX.Element {
  return (
    <div>
      <DangerousApprovalSettings />
      <BrowserAiSettings />
      <TrustedSitesSettings />
      <CommunityAdaptersSettings />
    </div>
  )
}
