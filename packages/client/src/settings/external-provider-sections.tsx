import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GeminiIcon, OpenCodeGoIcon } from '~renderer/status-bar/icons'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'
import { Label } from '~renderer/ui/label'
import { Switch } from '~renderer/ui/switch'

import { SearchableSetting } from './searchable-setting'

type ProviderSettingsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  recordFeatureInteraction: (feature: 'usage-tracking') => void
}

type GeminiAccountsSectionProps = ProviderSettingsProps & {
  localRuntimeSentenceLabel: string
}

export function GeminiAccountsSection({
  localRuntimeSentenceLabel,
  recordFeatureInteraction,
  settings,
  updateSettings
}: GeminiAccountsSectionProps): React.JSX.Element {
  return (
    <section id="accounts-gemini" className="scroll-mt-6 space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GeminiIcon size={16} />
          {translate('auto.components.settings.AccountsPane.0c64dc2a64', 'Gemini')}
        </h3>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.AccountsPane.973741a871',
            'Configure Gemini provider settings.'
          )}
        </p>
      </div>
      <SearchableSetting
        title={translate(
          'auto.components.settings.AccountsPane.0c7f915b01',
          'Use Gemini CLI credentials'
        )}
        description={translate(
          'auto.components.settings.AccountsPane.d676c41fc6',
          'Extracts OAuth credentials from your local Gemini CLI installation to authenticate with Google. This uses credentials issued to the Gemini CLI app, not AgentStart. May break if Google updates the CLI. Use at your own risk.'
        )}
        keywords={[
          'gemini',
          'cli',
          'oauth',
          'credentials',
          'experimental',
          'rate limit',
          'status bar'
        ]}
        className="flex items-center justify-between gap-4 py-2"
      >
        <div className="space-y-0.5">
          <Label>
            {translate(
              'auto.components.settings.AccountsPane.96f3649526',
              'Use Gemini CLI credentials (experimental)'
            )}
          </Label>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.AccountsPane.c2aee76420',
              'Extracts OAuth credentials from your local Gemini CLI installation to authenticate with Google for {{value0}}. This uses credentials issued to the Gemini CLI app, not AgentStart. May break if Google updates the CLI. Use at your own risk.',
              { value0: localRuntimeSentenceLabel }
            )}
          </p>
        </div>
        <Switch
          checked={settings.geminiCliOAuthEnabled}
          onCheckedChange={(checked) => {
            recordFeatureInteraction('usage-tracking')
            updateSettings({ geminiCliOAuthEnabled: checked })
          }}
        />
      </SearchableSetting>
    </section>
  )
}

export function OpenCodeAccountsSection({
  recordFeatureInteraction,
  settings,
  updateSettings
}: ProviderSettingsProps): React.JSX.Element {
  const recordedEditsRef = useRef<Set<'cookie' | 'workspaceId'>>(new Set())
  const recordEdit = (field: 'cookie' | 'workspaceId'): void => {
    if (recordedEditsRef.current.has(field)) {
      return
    }
    recordedEditsRef.current.add(field)
    recordFeatureInteraction('usage-tracking')
  }

  return (
    <section id="accounts-opencode-go" className="scroll-mt-6 space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <OpenCodeGoIcon size={16} />
          {translate('auto.components.settings.AccountsPane.4ac10b4d08', 'OpenCode Go')}
        </h3>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.AccountsPane.ea631977b5',
            'Configure OpenCode Go provider settings.'
          )}
        </p>
      </div>
      <SearchableSetting
        title={translate(
          'auto.components.settings.AccountsPane.36223200ac',
          'OpenCode Go Session Cookie'
        )}
        description={translate(
          'auto.components.settings.AccountsPane.b2b1aa936d',
          'Paste your opencode.ai session cookie for rate limit fetching.'
        )}
        keywords={['opencode', 'cookie', 'session', 'rate limit', 'status bar']}
        className="space-y-2"
      >
        <Label>
          {translate(
            'auto.components.settings.AccountsPane.67e3c33670',
            'OpenCode Go session cookie'
          )}
        </Label>
        <div className="flex gap-2">
          <Input
            type="password"
            value={settings.opencodeSessionCookie}
            onChange={(event) => {
              recordEdit('cookie')
              updateSettings({ opencodeSessionCookie: event.target.value })
            }}
            placeholder={translate(
              'auto.components.settings.AccountsPane.a7e38affcd',
              'Fe26.2**… token or auth=Fe26.2**… header'
            )}
            spellCheck={false}
            className="flex-1 text-xs"
          />
          {settings.opencodeSessionCookie ? (
            <Button
              variant="quiet"
              size="xs"
              onClick={() => {
                recordFeatureInteraction('usage-tracking')
                updateSettings({ opencodeSessionCookie: '' })
              }}
              className="h-7 shrink-0 text-xs"
            >
              {translate('auto.components.settings.AccountsPane.b398b834c9', 'Clear')}
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.AccountsPane.openCodeCookieHelp',
            "Paste the raw token or full cookie header. Find it in your browser's DevTools under Network → an opencode.ai request → Cookie header. OpenCode Go auth is shared across Windows and WSL terminals."
          )}
        </p>
      </SearchableSetting>
      <SearchableSetting
        title={translate(
          'auto.components.settings.AccountsPane.02cb127710',
          'OpenCode Go Workspace ID'
        )}
        description={translate(
          'auto.components.settings.AccountsPane.d70a5287a4',
          'Optional workspace ID override if the automatic lookup fails.'
        )}
        keywords={['opencode', 'workspace', 'id', 'wrk', 'rate limit', 'status bar']}
        className="space-y-2"
      >
        <Label>
          {translate('auto.components.settings.AccountsPane.dbdb0b0bd8', 'Workspace ID override')}
        </Label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={settings.opencodeWorkspaceId}
            onChange={(event) => {
              recordEdit('workspaceId')
              updateSettings({ opencodeWorkspaceId: event.target.value })
            }}
            placeholder={translate(
              'auto.components.settings.AccountsPane.a122332371',
              'wrk_… (leave blank for automatic lookup)'
            )}
            spellCheck={false}
            className="flex-1 text-xs"
          />
          {settings.opencodeWorkspaceId ? (
            <Button
              variant="quiet"
              size="xs"
              onClick={() => {
                recordFeatureInteraction('usage-tracking')
                updateSettings({ opencodeWorkspaceId: '' })
              }}
              className="h-7 shrink-0 text-xs"
            >
              {translate('auto.components.settings.AccountsPane.b398b834c9', 'Clear')}
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.AccountsPane.openCodeWorkspaceHelp',
            'Find this in the URL after logging into opencode.ai, for example opencode.ai/workspace/wrk_…/go.'
          )}
        </p>
      </SearchableSetting>
    </section>
  )
}
