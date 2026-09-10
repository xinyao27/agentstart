import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { TelemetryConsentState } from '@agentstart/protocol/telemetry/consent'
import { useEffect, useState } from 'react'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { BrowserContextPrivacySetting } from '~renderer/extension/context/privacy-setting'
import { translate } from '~renderer/i18n/i18n'
import { ShieldCheck } from '~renderer/icons/hugeicons'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { useAppStore } from '~renderer/store/state'
import {
  PRIVACY_URL,
  getConsentState,
  setOptIn as telemetrySetOptIn
} from '~renderer/telemetry/client'
import { Button } from '~renderer/ui/button'
import { Switch } from '~renderer/ui/switch'

import { Label } from '../ui/label'
import { PrivacyDiagnosticsSection } from './privacy-diagnostics-section'

type EnvBlockedReason = 'do_not_track' | 'agentstart_disabled' | 'ci'
type BlockedReason = { kind: 'env'; reason: EnvBlockedReason }

type PrivacyPaneProps = {
  settings: GlobalSettings
}

const PRIVACY_PANE_BLOCKED_HELPER_ID = 'privacy-pane-blocked-helper'

function isEnvBlocked(consent: TelemetryConsentState | null): consent is {
  effective: 'disabled'
  reason: EnvBlockedReason
} {
  return (
    consent?.effective === 'disabled' &&
    (consent.reason === 'do_not_track' ||
      consent.reason === 'agentstart_disabled' ||
      consent.reason === 'ci')
  )
}

function envVarNameForReason(reason: EnvBlockedReason): string {
  if (reason === 'do_not_track') {
    return 'DO_NOT_TRACK'
  }
  if (reason === 'agentstart_disabled') {
    return 'AGENT_START_TELEMETRY_DISABLED'
  }
  return 'CI'
}

function computeBlockedReason(consent: TelemetryConsentState | null): BlockedReason | null {
  if (isEnvBlocked(consent)) {
    return { kind: 'env', reason: consent.reason }
  }
  return null
}

export function PrivacyPane({ settings }: PrivacyPaneProps): React.JSX.Element {
  const [consent, setConsent] = useState<TelemetryConsentState | null>(null)
  const [inFlight, setInFlight] = useState(false)
  const mountedRef = useMountedRef()
  const fetchSettings = useAppStore((s) => s.fetchSettings)

  useEffect(() => {
    let stale = false
    void getConsentState().then((state) => {
      if (!stale) {
        setConsent(state)
      }
    })
    return () => {
      stale = true
    }
  }, [settings.telemetry?.optedIn])

  const blocked = computeBlockedReason(consent)
  const toggleChecked = settings.telemetry?.optedIn === true

  const handleToggle = async (): Promise<void> => {
    if (blocked || inFlight) {
      return
    }
    setInFlight(true)
    try {
      await telemetrySetOptIn(!toggleChecked)
      await fetchSettings()
    } finally {
      if (mountedRef.current) {
        setInFlight(false)
      }
    }
  }

  return (
    <div className="space-y-4">
      <BrowserContextPrivacySetting />
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            <Label>
              {translate(
                'auto.components.settings.PrivacyPane.fe904ac984',
                'Share anonymous usage data'
              )}
            </Label>
          </div>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.PrivacyPane.8bfdd23a88',
              'Help us figure out what to build next. AgentStart sends anonymous counts of which features you use and where things break.'
            )}{' '}
            <Button
              variant="ghost"
              size="xs"
              type="button"
              className="hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent h-auto border-0 p-0 underline underline-offset-2"
              onClick={(event) => openHttpLink(PRIVACY_URL, { event })}
            >
              {translate('auto.components.settings.PrivacyPane.77410e0566', 'Privacy policy')}
            </Button>
            .
          </p>
        </div>
        <Switch
          checked={toggleChecked}
          aria-label={translate(
            'auto.components.settings.PrivacyPane.fe904ac984',
            'Share anonymous usage data'
          )}
          aria-describedby={blocked ? PRIVACY_PANE_BLOCKED_HELPER_ID : undefined}
          disabled={blocked !== null || inFlight}
          onCheckedChange={handleToggle}
        />
      </div>

      {blocked ? <BlockedHelper blocked={blocked} id={PRIVACY_PANE_BLOCKED_HELPER_ID} /> : null}
      <PrivacyDiagnosticsSection />
    </div>
  )
}

function BlockedHelper({ blocked, id }: { blocked: BlockedReason; id: string }): React.JSX.Element {
  return (
    <div id={id} className="text-muted-foreground pb-2 text-xs">
      {blocked.reason === 'ci' ? (
        <p>
          {translate(
            'auto.components.settings.PrivacyPane.e3970bbbf5',
            'Telemetry is disabled because a CI environment variable is set. Unset it and restart.'
          )}
        </p>
      ) : (
        <p>
          {translate(
            'auto.components.settings.PrivacyPane.79a0f3c16c',
            'Telemetry is disabled by the'
          )}{' '}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
            {envVarNameForReason(blocked.reason)}
          </code>{' '}
          {translate(
            'auto.components.settings.PrivacyPane.36e0e2e63b',
            'environment variable. Unset it and restart to re-enable.'
          )}
        </p>
      )}
    </div>
  )
}
