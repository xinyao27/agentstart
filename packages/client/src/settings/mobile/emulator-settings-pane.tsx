import type { EmulatorAvailabilityValue, EmulatorDeviceValue } from '@agentstart/protocol'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { IosBrandIcon } from '~renderer/mobile/brand-icons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { requireEmulatorClient } from '~renderer/runtime/emulator-target'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Label } from '~renderer/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import { SettingsRow, SettingsSwitchRow } from '../form-controls'
import { SearchableSetting } from '../searchable-setting'
import { MobileEmulatorAgentControlRow } from './emulator-agent-control-row'
import { MobileEmulatorAvailabilityDetails } from './emulator-availability-details'
import { getMobileEmulatorSearchEntries } from './emulator-search'

type MobileEmulatorSettingsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

const AUTOMATIC_DEVICE_VALUE = '__agentstart_automatic_emulator_device__'
const AUTOMATIC_DEVICE_LABEL = 'Auto-select device'
const SIMULATOR_STATE_SUFFIX_RE =
  /\s+\((Booted|Booting|Creating|Shutdown|Shutting Down|Unavailable|Unknown)\)\s*$/i

function statusText(availability: EmulatorAvailabilityValue | null, enabled: boolean): string {
  if (!enabled) {
    return translate('auto.components.settings.MobileEmulatorSettingsPane.a4f1c82d90', 'Disabled')
  }
  if (!availability) {
    return translate(
      'auto.components.settings.MobileEmulatorSettingsPane.b5e2d93e01',
      'Checking...'
    )
  }
  return availability.available
    ? translate('auto.components.settings.MobileEmulatorSettingsPane.c6f3ea4f12', 'Ready')
    : translate('auto.components.settings.MobileEmulatorSettingsPane.d704fb5023', 'Needs setup')
}

function statusBadgeClassName(
  availability: EmulatorAvailabilityValue | null,
  enabled: boolean
): string {
  if (!enabled) {
    return 'border-border/50 bg-muted/30 text-muted-foreground'
  }
  if (!availability) {
    return 'border-border/50 bg-muted/30 text-muted-foreground'
  }
  return availability.available
    ? 'border-green-700/25 bg-green-700/10 text-green-700 dark:border-green-300/25 dark:bg-green-300/10 dark:text-green-300'
    : 'border-destructive/30 bg-destructive/10 text-destructive'
}

function deviceLabel(device: EmulatorDeviceValue): string {
  const state = device.state.trim()
  const name = device.name.replace(SIMULATOR_STATE_SUFFIX_RE, '').trim()
  if (device.isAvailable === false) {
    return `${name} (Unavailable)`
  }
  if (!state || state.toLowerCase() === 'shutdown') {
    return name
  }
  return `${name} (${state})`
}

function DeviceSelectItemLabel({ device }: { device: EmulatorDeviceValue }): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <IosBrandIcon className="text-muted-foreground size-3.5 shrink-0 fill-current" />
      <span className="truncate">{deviceLabel(device)}</span>
    </span>
  )
}

function availabilityDetail(availability: EmulatorAvailabilityValue | null): string {
  if (!availability) {
    return translate(
      'auto.components.settings.MobileEmulatorSettingsPane.06b06429c6',
      'Checking iOS Simulator support.'
    )
  }
  if (availability.available) {
    return availability.devices.length === 1
      ? translate(
          'auto.components.settings.MobileEmulatorSettingsPane.6d1483d4a0',
          '1 emulator device detected.'
        )
      : translate(
          'auto.components.settings.MobileEmulatorSettingsPane.0a452d4d3b',
          '{{value0}} emulator devices detected.',
          { value0: availability.devices.length }
        )
  }
  return availability.simctl.message || availability.serveSim.message || availability.message
}

export function MobileEmulatorSettingsPane({
  settings,
  updateSettings
}: MobileEmulatorSettingsPaneProps): React.JSX.Element {
  const [availability, setAvailability] = useState<EmulatorAvailabilityValue | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const enabled = settings.mobileEmulatorEnabled !== false

  const refreshAvailability = useEventCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      const result = await (await requireEmulatorClient()).availability()
      setAvailability(result)
    } catch (error) {
      setAvailability({
        platform: '',
        available: false,
        devices: [],
        simctl: { ok: false },
        serveSim: { ok: false },
        message: error instanceof Error ? error.message : 'Could not check emulator availability.'
      })
    } finally {
      setRefreshing(false)
    }
  })

  useEffect(() => {
    void refreshAvailability()
  }, [refreshAvailability])

  const devices = availability?.devices ?? []
  const selectedDeviceKnown = devices.some(
    (device) => device.udid === settings.mobileEmulatorDefaultDeviceUdid
  )
  const selectValue =
    settings.mobileEmulatorDefaultDeviceUdid && selectedDeviceKnown
      ? settings.mobileEmulatorDefaultDeviceUdid
      : AUTOMATIC_DEVICE_VALUE

  const defaultDeviceDescription = (() => {
    if (devices.length === 0) {
      return translate(
        'auto.components.settings.MobileEmulatorSettingsPane.f62a1bb759',
        'AgentStart will auto-select an emulator device after devices are detected.'
      )
    }
    return translate(
      'auto.components.settings.MobileEmulatorSettingsPane.b2fd62ea75',
      'Default device for new emulator tabs and agent attach commands. Auto-select prefers an already running device.'
    )
  })()

  return (
    <div className="space-y-4">
      <SearchableSetting
        title={translate(
          'auto.components.settings.MobileEmulatorSettingsPane.6593c9ddd3',
          'Mobile Emulator'
        )}
        description={translate(
          'auto.components.settings.MobileEmulatorSettingsPane.bc39d0f115',
          'Configure mobile emulator support for AgentStart and coding agents.'
        )}
        keywords={getMobileEmulatorSearchEntries().flatMap((entry) => entry.keywords ?? [])}
        className="divide-border/40 divide-y"
      >
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.700ddbf9b1',
            'Enable Mobile Emulator'
          )}
          description={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.f9af91ea26',
            'Shows the New Mobile Emulator action and allows agents to attach to the active emulator.'
          )}
          checked={enabled}
          onChange={() => updateSettings({ mobileEmulatorEnabled: !enabled })}
        />

        <div className="py-2">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label>
                {translate(
                  'auto.components.settings.MobileEmulatorSettingsPane.ae1612c58c',
                  'Availability'
                )}
              </Label>
              <p className="text-muted-foreground text-xs">{availabilityDetail(availability)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge
                variant="outline"
                className={cn('text-[11px]', statusBadgeClassName(availability, enabled))}
              >
                {refreshing ? <LoadingIndicator className="size-3" /> : null}
                {statusText(availability, enabled)}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.settings.MobileEmulatorSettingsPane.8aec2f99a0',
                  'Refresh emulator availability'
                )}
                onClick={() => void refreshAvailability()}
                disabled={refreshing}
              >
                {refreshing ? (
                  <LoadingIndicator className="size-3.5" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          {enabled ? <MobileEmulatorAvailabilityDetails availability={availability} /> : null}
        </div>

        <SettingsRow
          alignTop
          label={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.143961d031',
            'Default Device'
          )}
          description={defaultDeviceDescription}
          control={
            <Select
              value={selectValue}
              disabled={!enabled}
              onValueChange={(value) =>
                updateSettings({
                  mobileEmulatorDefaultDeviceUdid: value === AUTOMATIC_DEVICE_VALUE ? null : value
                })
              }
            >
              <SelectTrigger size="sm" className="w-56 max-w-full">
                <SelectValue placeholder={AUTOMATIC_DEVICE_LABEL} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="end">
                <SelectItem value={AUTOMATIC_DEVICE_VALUE}>{AUTOMATIC_DEVICE_LABEL}</SelectItem>
                {devices.map((device) => (
                  <SelectItem
                    key={device.udid}
                    value={device.udid}
                    label={deviceLabel(device)}
                    disabled={device.isAvailable === false}
                  >
                    <DeviceSelectItemLabel device={device} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SearchableSetting>

      {enabled ? (
        <SearchableSetting
          title={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.f2f8d97bb6',
            'Agent Mobile Emulator Control'
          )}
          description={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.19d39113b6',
            'Let coding agents control the active mobile emulator with AgentStart CLI commands.'
          )}
          keywords={getMobileEmulatorSearchEntries()[3]?.keywords}
        >
          <MobileEmulatorAgentControlRow />
        </SearchableSetting>
      ) : null}
    </div>
  )
}
