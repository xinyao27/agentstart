import { translate } from '~renderer/i18n/i18n'

import type { SettingsSearchEntry } from './search'

export function getAutomationsSearchEntries(): SettingsSearchEntry[] {
  return [
    {
      title: translate('extension.automations.title', 'Automations'),
      description: translate(
        'extension.automations.description',
        'Start and end your workday, schedule daemon routines, and arrange project windows.'
      ),
      keywords: [
        translate('extension.automations.startDay', 'Start day'),
        translate('extension.automations.endDay', 'End day'),
        translate('extension.automations.schedule', 'Daemon schedule')
      ]
    }
  ]
}
