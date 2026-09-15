import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { DeviceMobile, QrCode } from '~renderer/icons/hugeicons'
import { AGENTSTART_IOS_TESTFLIGHT_URL } from '~renderer/mobile/downloads'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'

import { SettingsSwitchRow } from '../form-controls'
import { SettingsGroupCards } from '../group-card'
import { MobilePane } from './pane'
import { getMobilePaneSearchEntries } from './pane-search'
import {
  getMobileOverviewSearchEntry,
  getMobileSidebarShortcutSearchEntry
} from './settings-search'

export function MobileSettingsPane(): React.JSX.Element {
  const showMobileButton = useAppStore((s) => s.settings?.showMobileButton !== false)
  const updateSettings = useAppStore((s) => s.updateSettings)

  return (
    <SettingsGroupCards
      defaultOpenId="mobile-general"
      groups={[
        {
          id: 'mobile-general',
          icon: <DeviceMobile aria-hidden="true" />,
          title: translate('auto.components.settings.MobileSettingsPane.e7a3ae8c4e', 'Mobile'),
          summary: translate(
            'auto.components.settings.MobileSettingsPane.174f4a3c6d',
            'Control terminals and agents from your phone.'
          ),
          searchEntries: [getMobileOverviewSearchEntry(), getMobileSidebarShortcutSearchEntry()],
          content: (
            <div className="divide-border/40 divide-y">
              <p className="text-muted-foreground py-3 text-xs">
                {translate(
                  'auto.components.settings.MobileSettingsPane.c8491c17ef',
                  'Control AgentStart from your phone by scanning a QR code. Mobile downloads:'
                )}{' '}
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  onClick={(event) => openHttpLink(AGENTSTART_IOS_TESTFLIGHT_URL, { event })}
                  className="hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent h-auto border-0 p-0 underline underline-offset-2"
                >
                  {translate(
                    'auto.components.settings.MobileSettingsPane.testFlight',
                    'TestFlight'
                  )}
                </Button>
                .
              </p>

              {/* Why: the in-page removal toast points users to Settings > Mobile. */}
              <SettingsSwitchRow
                label={translate(
                  'auto.components.settings.MobileSettingsPane.1de96ec8a6',
                  'Show AgentStart Mobile Button'
                )}
                description={translate(
                  'auto.components.settings.MobileSettingsPane.d4f2b65f30',
                  'Show the AgentStart Mobile shortcut in the sidebar.'
                )}
                checked={showMobileButton}
                onChange={() => updateSettings({ showMobileButton: !showMobileButton })}
              />
            </div>
          )
        },
        {
          id: 'mobile-pair',
          icon: <QrCode aria-hidden="true" />,
          title: translate(
            'auto.components.settings.mobile.pane.search.d49925710a',
            'Mobile Pairing'
          ),
          summary: translate(
            'auto.components.settings.mobile.pane.search.7fb728fb2b',
            'Pair a mobile device by scanning a QR code.'
          ),
          searchEntries: getMobilePaneSearchEntries(),
          content: (
            <div className="py-3">
              <MobilePane />
            </div>
          )
        }
      ]}
    />
  )
}
