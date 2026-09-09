import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { FileAudio, Upload, SpeakerHigh as Volume2 } from '~renderer/icons/hugeicons'
import { getNotificationSoundOptions } from '~renderer/notifications/sound-options'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'

import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '../ui/select'
import { Slider } from '../ui/slider'

const CHOOSE_CUSTOM_SOUND_VALUE = 'choose-custom-file'

type NotificationSoundSelectValue =
  | GlobalSettings['notifications']['customSoundId']
  | typeof CHOOSE_CUSTOM_SOUND_VALUE

function isNotificationSoundId(
  value: NotificationSoundSelectValue
): value is GlobalSettings['notifications']['customSoundId'] {
  return value !== CHOOSE_CUSTOM_SOUND_VALUE
}

type NotificationSoundSectionProps = {
  notificationSettings: GlobalSettings['notifications']
  notificationsEnabled: boolean
  volumeDraft: number
  onVolumeDraftChange: (value: number) => void
  onVolumeCommit: (value: number) => void
  onUpdateNotificationSettings: (updates: Partial<GlobalSettings['notifications']>) => Promise<void>
}

export function NotificationSoundSection({
  notificationSettings,
  notificationsEnabled,
  volumeDraft,
  onVolumeDraftChange,
  onVolumeCommit,
  onUpdateNotificationSettings
}: NotificationSoundSectionProps): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [isPickingSound, setIsPickingSound] = useState(false)

  const previewSound = async (
    customSoundId: GlobalSettings['notifications']['customSoundId']
  ): Promise<void> => {
    if (customSoundId === 'system') {
      return
    }
    const result = await shellClient.notifications.playSound({
      force: true,
      soundId: customSoundId,
      volume: volumeDraft
    })
    if (!result.played) {
      toast.error(
        translate(
          'auto.components.settings.NotificationsPane.0fadad17ce',
          'Notification sound could not be played'
        )
      )
    }
  }

  const handleChooseCustomSound = async (): Promise<void> => {
    setIsPickingSound(true)
    try {
      const soundPath = await shellClient.shell.pickAudio()
      if (soundPath) {
        await onUpdateNotificationSettings({ customSoundId: 'custom', customSoundPath: soundPath })
        await previewSound('custom')
      }
    } finally {
      if (mountedRef.current) {
        setIsPickingSound(false)
      }
    }
  }

  const handleSoundSelect = async (value: NotificationSoundSelectValue): Promise<void> => {
    if (!isNotificationSoundId(value)) {
      await handleChooseCustomSound()
      return
    }
    await onUpdateNotificationSettings({ customSoundId: value })
    await previewSound(value)
  }

  const selectedSoundId = notificationSettings.customSoundId
  const soundOptions = getNotificationSoundOptions(notificationSettings.customSoundPath)
  // Why: Base UI otherwise renders the stored id (for example, "two-tone")
  // in the trigger instead of the translated, user-facing sound name.
  const soundSelectItems = soundOptions.map((option) => ({
    label: option.title,
    value: option.id
  }))

  return (
    <div className="space-y-2 py-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <FileAudio className="size-4" />
          <Label>
            {translate(
              'auto.components.settings.NotificationsPane.88686e6ca8',
              'Notification Sound'
            )}
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.NotificationsPane.2a2033c388',
            'Choose the alert Yiru plays when a system notification is delivered.'
          )}
        </p>
      </div>
      <Select
        items={soundSelectItems}
        value={selectedSoundId}
        disabled={!notificationsEnabled || isPickingSound}
        onValueChange={(value) => void handleSoundSelect(value as NotificationSoundSelectValue)}
      >
        <SelectTrigger className="w-full max-w-[360px]" size="sm">
          <SelectValue
            placeholder={translate(
              'auto.components.settings.NotificationsPane.c258cb96dc',
              'Choose notification sound'
            )}
          />
        </SelectTrigger>
        <SelectContent align="start" className="w-[--radix-select-trigger-width]">
          {soundOptions.map((option) => {
            const OptionIcon = option.icon
            return (
              <SelectItem key={option.id} value={option.id}>
                <OptionIcon className="size-4" />
                <span className="truncate">{option.title}</span>
              </SelectItem>
            )
          })}
          <SelectSeparator />
          <SelectItem value={CHOOSE_CUSTOM_SOUND_VALUE}>
            <Upload className="size-4" />
            <span>
              {notificationSettings.customSoundPath
                ? translate(
                    'auto.components.settings.NotificationsPane.76e02467b8',
                    'Change Custom File'
                  )
                : translate(
                    'auto.components.settings.NotificationsPane.6e6df3a09a',
                    'Choose Custom File'
                  )}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {notificationSettings.customSoundPath ? (
        <p
          className="text-muted-foreground truncate font-mono text-[11px]"
          title={notificationSettings.customSoundPath}
        >
          {translate('auto.components.settings.NotificationsPane.4aa5085cd7', 'Custom:')}
          {notificationSettings.customSoundPath}
        </p>
      ) : null}
      {selectedSoundId !== 'system' ? (
        <div className="flex items-center gap-3 pt-1">
          <Volume2 className="text-muted-foreground size-4" />
          <Slider
            value={[volumeDraft]}
            min={0}
            max={100}
            step={5}
            disabled={!notificationsEnabled}
            onValueChange={(value) => onVolumeDraftChange(Array.isArray(value) ? value[0] : value)}
            onValueCommitted={(value) => onVolumeCommit(Array.isArray(value) ? value[0] : value)}
            className="flex-1"
            aria-label={translate(
              'auto.components.settings.NotificationsPane.2a42dd8d6f',
              'Notification sound volume'
            )}
          />
          <span className="text-muted-foreground w-10 text-right font-mono text-xs tabular-nums">
            {volumeDraft}%
          </span>
        </div>
      ) : null}
    </div>
  )
}
