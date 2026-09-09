import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { BellRinging as BellRing, FileAudio, Upload } from '~renderer/icons/hugeicons'
import {
  MacNotificationPermissionCard,
  useMacNotificationPermissionState
} from '~renderer/notifications/mac-notification-permission-card'
import { getNotificationSoundOptions } from '~renderer/notifications/sound-options'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'
import { sendNotificationSettingsTestNotification } from '~renderer/settings/notifications-pane'
import { Button } from '~renderer/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '~renderer/ui/select'

type NotificationStepProps = {
  settings: GlobalSettings | null
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void> | void
}

const CHOOSE_CUSTOM_SOUND_VALUE = 'choose-custom-file'

type NotificationSoundSelectValue =
  | GlobalSettings['notifications']['customSoundId']
  | typeof CHOOSE_CUSTOM_SOUND_VALUE

function isNotificationSoundId(
  value: NotificationSoundSelectValue
): value is GlobalSettings['notifications']['customSoundId'] {
  return value !== CHOOSE_CUSTOM_SOUND_VALUE
}

export function NotificationStep({
  settings,
  updateSettings
}: NotificationStepProps): React.JSX.Element {
  const notificationSettings = settings?.notifications
  // Why: undefined settings are still loading — assume enabled (the default)
  // so the fresh-install permission flow starts without waiting.
  const [macPermissionState, setMacPermissionState] = useMacNotificationPermissionState(
    notificationSettings?.enabled !== false
  )
  const [isPickingSound, setIsPickingSound] = useState(false)
  const [selectPortalRoot, setSelectPortalRoot] = useState<HTMLElement | null>(null)
  const mountedRef = useMountedRef()

  const setSelectPortalHost = (node: HTMLDivElement | null) => {
    // Why: onboarding sits above body-level portals, so the select menu must
    // portal into the overlay to stay clickable.
    setSelectPortalRoot(node?.closest<HTMLElement>('[data-onboarding-overlay]') ?? node)
  }

  const updateNotificationSettings = async (
    updates: Partial<GlobalSettings['notifications']>
  ): Promise<void> => {
    const current = notificationSettings
    if (!current) {
      return
    }
    const nextNotifications = {
      ...current,
      ...updates
    }
    await updateSettings({
      notifications: nextNotifications
    })
  }

  const getCustomSoundVolume = (): number => notificationSettings?.customSoundVolume ?? 100

  const previewSound = async (
    customSoundId: GlobalSettings['notifications']['customSoundId']
  ): Promise<void> => {
    if (customSoundId === 'system') {
      return
    }
    const result = await shellClient.notifications.playSound({
      force: true,
      soundId: customSoundId,
      volume: getCustomSoundVolume()
    })
    if (!result.played) {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.onboarding.NotificationStep.b6a994e36e',
            'Notification sound could not be played'
          )
        )
      }
    }
  }

  const handleChooseCustomSound = async (): Promise<void> => {
    setIsPickingSound(true)
    try {
      const soundPath = await shellClient.shell.pickAudio()
      if (soundPath) {
        await updateNotificationSettings({ customSoundId: 'custom', customSoundPath: soundPath })
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
    await updateNotificationSettings({ customSoundId: value })
    await previewSound(value)
  }

  const handleSendTestNotification = async (): Promise<void> => {
    if (!notificationSettings) {
      toast.error(
        translate(
          'auto.components.onboarding.NotificationStep.3cd5374e22',
          'Notification settings are still loading'
        )
      )
      return
    }
    const showsMacPermissionCard = macPermissionState !== null
    const outcome = await sendNotificationSettingsTestNotification(
      notificationSettings,
      getCustomSoundVolume(),
      showsMacPermissionCard ? { suppressSystemPermissionToasts: true } : undefined
    )
    if (!mountedRef.current || !showsMacPermissionCard) {
      return
    }
    // Why: the test doubles as a permission re-check — its confirmed outcome
    // is fresher than whatever the mount-time probe reported.
    if (outcome === 'delivered') {
      setMacPermissionState('enabled')
    } else if (outcome === 'not-displayed') {
      setMacPermissionState('blocked')
    }
  }

  if (!notificationSettings) {
    return (
      <div className="border-border bg-muted/20 text-muted-foreground border px-5 py-4 text-sm">
        {translate(
          'auto.components.onboarding.NotificationStep.e52aacf380',
          'Loading notification settings…'
        )}
      </div>
    )
  }

  const customPath = notificationSettings.customSoundPath
  const selectedSoundId = notificationSettings.customSoundId
  const soundOptions = getNotificationSoundOptions(customPath)
  // Why: Base UI otherwise renders the stored id (for example, "two-tone")
  // in the trigger instead of the translated, user-facing sound name.
  const soundSelectItems = soundOptions.map((option) => ({
    label: option.title,
    value: option.id
  }))

  return (
    <div ref={setSelectPortalHost} className="space-y-5">
      <MacNotificationPermissionCard state={macPermissionState} />

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-foreground text-sm font-semibold">
            {translate('auto.components.onboarding.NotificationStep.0af746e41f', 'Choose a sound')}
          </h2>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            {translate(
              'auto.components.onboarding.NotificationStep.0fe570690c',
              'Pick the alert Yiru plays after a system notification is delivered.'
            )}
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-foreground flex items-center gap-2 text-sm font-medium">
            <FileAudio className="size-4" />
            {translate(
              'auto.components.onboarding.NotificationStep.53aaffe49a',
              'Notification Sound'
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              items={soundSelectItems}
              value={selectedSoundId}
              disabled={isPickingSound}
              onValueChange={(value) =>
                void handleSoundSelect(value as NotificationSoundSelectValue)
              }
            >
              <SelectTrigger className="w-[360px] max-w-full" size="sm">
                <SelectValue
                  placeholder={translate(
                    'auto.components.onboarding.NotificationStep.dc897423e1',
                    'Choose notification sound'
                  )}
                />
              </SelectTrigger>
              <SelectContent
                portalContainer={selectPortalRoot}
                align="start"
                className="w-[--radix-select-trigger-width]"
              >
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
                    {customPath
                      ? translate(
                          'auto.components.onboarding.NotificationStep.ac80d97e02',
                          'Change Custom File'
                        )
                      : translate(
                          'auto.components.onboarding.NotificationStep.c0692baa52',
                          'Choose Custom File'
                        )}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void handleSendTestNotification()}
            >
              <BellRing className="size-3.5" />
              {translate(
                'auto.components.onboarding.NotificationStep.3bede04483',
                'Send Test Notification'
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
