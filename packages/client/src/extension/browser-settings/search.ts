import { translate } from '~renderer/i18n/i18n'
import type { SettingsSearchEntry } from '~renderer/settings/search'

export function getBrowserSettingsSearchEntries(): SettingsSearchEntry[] {
  return [
    {
      title: translate('extension.browserSettings.title', 'Browser settings'),
      description: translate(
        'extension.browserSettings.description',
        'Preferences that only apply to AgentStart running inside this browser.'
      ),
      keywords: [translate('extension.browserSettings.keywordChrome', 'Chrome')]
    },
    {
      title: translate(
        'extension.browserSettings.dangerousApproval',
        'Dangerous operation approval'
      ),
      description: translate(
        'extension.browserSettings.dangerousApprovalDescription',
        'Optionally require a passkey, Touch ID, Windows Hello, or security key before agent permission approvals.'
      ),
      keywords: [
        translate('extension.browserSettings.keywordPasskey', 'passkey'),
        translate('extension.browserSettings.keywordSecurityKey', 'security key')
      ]
    },
    {
      title: translate('extension.browserSettings.browserAi', 'On-device summaries'),
      description: translate(
        'extension.browserSettings.browserAiDescription',
        "Use Chrome's local Summarizer for optional activity digests. AgentStart always falls back to a deterministic summary."
      ),
      keywords: [
        translate('extension.browserSettings.keywordLocalSummaries', 'local summaries'),
        translate('extension.browserSettings.keywordBrowserAi', 'browser AI')
      ]
    }
  ]
}
