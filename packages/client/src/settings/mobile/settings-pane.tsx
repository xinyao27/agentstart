import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { YIRU_IOS_TESTFLIGHT_URL } from '~renderer/mobile/downloads'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'

import { SettingsSwitchRow } from '../form-controls'
import { SearchableSetting } from '../searchable-setting'
import { MobilePane } from './pane'
import {
  getMobileOverviewSearchEntry,
  getMobileSidebarShortcutSearchEntry,
  getMobileSettingsPaneSearchEntries
} from './settings-search'
export { getMobileSettingsPaneSearchEntries }

export function MobileSettingsPane(): React.JSX.Element {
  const showMobileButton = useAppStore((s) => s.settings?.showMobileButton !== false)
  const updateSettings = useAppStore((s) => s.updateSettings)

  return (
    <div className="space-y-4">
      <SearchableSetting
        title={translate('auto.components.settings.MobileSettingsPane.e7a3ae8c4e', 'Mobile')}
        description={translate(
          'auto.components.settings.MobileSettingsPane.174f4a3c6d',
          'Control terminals and agents from your phone.'
        )}
        keywords={getMobileOverviewSearchEntry().keywords}
        className="space-y-3 py-2"
      >
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.MobileSettingsPane.c8491c17ef',
            'Control Yiru from your phone by scanning a QR code. Mobile downloads:'
          )}{' '}
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={(event) => openHttpLink(YIRU_IOS_TESTFLIGHT_URL, { event })}
            className="hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent h-auto border-0 p-0 underline underline-offset-2"
          >
            {translate('auto.components.settings.MobileSettingsPane.testFlight', 'TestFlight')}
          </Button>
          .
        </p>
      </SearchableSetting>

      <SearchableSetting
        title={translate(
          'auto.components.settings.MobileSettingsPane.1de96ec8a6',
          'Show Yiru Mobile Button'
        )}
        description={translate(
          'auto.components.settings.MobileSettingsPane.682293cadf',
          'Show the Yiru Mobile button at the top of the left sidebar.'
        )}
        keywords={getMobileSidebarShortcutSearchEntry().keywords}
      >
        {/* Why: the in-page removal toast points users to Settings > Mobile. */}
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.MobileSettingsPane.1de96ec8a6',
            'Show Yiru Mobile Button'
          )}
          description={translate(
            'auto.components.settings.MobileSettingsPane.d4f2b65f30',
            'Show the Yiru Mobile shortcut in the sidebar.'
          )}
          checked={showMobileButton}
          onChange={() => updateSettings({ showMobileButton: !showMobileButton })}
        />
      </SearchableSetting>

      <div className="border-border/60 bg-card/50 border p-4">
        <MobilePane />
      </div>
    </div>
  )
}
