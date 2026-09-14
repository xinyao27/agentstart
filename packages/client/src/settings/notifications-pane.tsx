import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { FileAudio, BellRinging as BellRing, Robot as Bot } from '~renderer/icons/hugeicons'
import {
  MacNotificationPermissionCard,
  useMacNotificationPermissionState
} from '~renderer/notifications/mac-notification-permission-card'
import { useAppStore } from '~renderer/store/state'

import { Button } from '../ui/button'
import { SettingsGroupCards } from './group-card'
import { NotificationSettingToggle } from './notification-setting-toggle'
import {
  createNotificationVolumeDraftState,
  resolveNotificationVolumeDraftState,
  sendNotificationSettingsTestNotification
} from './notification-settings-copy'
import { NotificationSoundSection } from './notification-sound-section'
import {
  getNotificationDeliverySearchEntries,
  getNotificationEventsSearchEntries,
  getNotificationSoundSearchEntries
} from './notifications-search'
export { sendNotificationSettingsTestNotification } from './notification-settings-copy'

type NotificationsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function NotificationsPane({
  settings,
  updateSettings
}: NotificationsPaneProps): React.JSX.Element {
  const notificationSettings = settings.notifications
  const notificationSettingsRef = useRef(notificationSettings)
  const [macPermissionState, setMacPermissionState] = useMacNotificationPermissionState(
    notificationSettings.enabled
  )

  const updateNotificationSettings = async (
    updates: Partial<GlobalSettings['notifications']>
  ): Promise<void> => {
    const nextNotifications = {
      ...notificationSettingsRef.current,
      ...updates
    }
    notificationSettingsRef.current = nextNotifications
    await updateSettings({
      notifications: {
        ...nextNotifications
      }
    })
  }

  useEffect(() => {
    notificationSettingsRef.current = notificationSettings
  }, [notificationSettings])

  const [volumeDraftState, setVolumeDraftState] = useState(() =>
    createNotificationVolumeDraftState(notificationSettings.customSoundVolume)
  )
  const resolvedVolumeDraftState = resolveNotificationVolumeDraftState(
    volumeDraftState,
    notificationSettings.customSoundVolume
  )
  if (resolvedVolumeDraftState !== volumeDraftState) {
    setVolumeDraftState(resolvedVolumeDraftState)
  }
  const volumeDraft = resolvedVolumeDraftState.draft
  const setVolumeDraft = (value: number): void => {
    setVolumeDraftState((current) => ({
      ...resolveNotificationVolumeDraftState(current, notificationSettings.customSoundVolume),
      draft: value
    }))
  }

  const handleVolumeCommit = (value: number): void => {
    if (notificationSettingsRef.current.customSoundVolume !== value) {
      void updateNotificationSettings({ customSoundVolume: value })
    }
  }

  const handleSendTestNotification = async (): Promise<void> => {
    useAppStore.getState().recordFeatureInteraction('notifications')
    const showsMacPermissionCard = macPermissionState !== null
    const outcome = await sendNotificationSettingsTestNotification(
      notificationSettings,
      volumeDraft,
      // Why: the card renders delivery state inline, so the ambiguous darwin
      // "check if a banner appeared" toasts would contradict it.
      showsMacPermissionCard ? { suppressSystemPermissionToasts: true } : undefined
    )
    if (!showsMacPermissionCard) {
      return
    }
    if (outcome === 'delivered') {
      setMacPermissionState('enabled')
    } else if (outcome === 'not-displayed') {
      setMacPermissionState('blocked')
    }
  }

  return (
    <div className="space-y-2.5">
      {macPermissionState !== null ? (
        <MacNotificationPermissionCard state={macPermissionState} />
      ) : null}
      <SettingsGroupCards
        groups={[
          {
            id: 'notifications-delivery',
            icon: <BellRing aria-hidden="true" />,
            title: translate(
              'auto.components.settings.NotificationsPane.groupDelivery',
              'Delivery'
            ),
            searchEntries: getNotificationDeliverySearchEntries(),
            content: (
              <div className="divide-border/40 divide-y">
                <NotificationSettingToggle
                  label={translate(
                    'auto.components.settings.NotificationsPane.841c8c549f',
                    'Enable Notifications'
                  )}
                  description={translate(
                    'auto.components.settings.NotificationsPane.deff6d30da',
                    'Native system notifications for background events.'
                  )}
                  checked={notificationSettings.enabled}
                  onToggle={() => {
                    if (!notificationSettings.enabled) {
                      useAppStore.getState().recordFeatureInteraction('notifications')
                    }
                    void updateNotificationSettings({ enabled: !notificationSettings.enabled })
                  }}
                />
                <NotificationSettingToggle
                  label={translate(
                    'auto.components.settings.NotificationsPane.00cd406dbb',
                    'Suppress While Focused'
                  )}
                  description={translate(
                    'auto.components.settings.NotificationsPane.2772d2f257',
                    'Skip notifications when the triggering worktree is already visible.'
                  )}
                  checked={notificationSettings.suppressWhenFocused}
                  disabled={!notificationSettings.enabled}
                  onToggle={() =>
                    void updateNotificationSettings({
                      suppressWhenFocused: !notificationSettings.suppressWhenFocused
                    })
                  }
                />
                <div className="flex flex-wrap items-center gap-2 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!notificationSettings.enabled}
                    onClick={() => void handleSendTestNotification()}
                    className="gap-2"
                  >
                    <BellRing className="size-3.5" />
                    {translate(
                      'auto.components.settings.NotificationsPane.906b4afebf',
                      'Send Test Notification'
                    )}
                  </Button>
                </div>
              </div>
            )
          },
          {
            id: 'notifications-events',
            icon: <Bot aria-hidden="true" />,
            title: translate('auto.components.settings.NotificationsPane.groupEvents', 'Events'),
            searchEntries: getNotificationEventsSearchEntries(),
            content: (
              <div className="divide-border/40 divide-y">
                <NotificationSettingToggle
                  label={translate(
                    'auto.components.settings.NotificationsPane.ca76d06fd2',
                    'Agent Task Complete'
                  )}
                  description={translate(
                    'auto.components.settings.NotificationsPane.55f901a59b',
                    'A coding agent finishes and becomes idle.'
                  )}
                  checked={notificationSettings.agentTaskComplete}
                  disabled={!notificationSettings.enabled}
                  onToggle={() =>
                    void updateNotificationSettings({
                      agentTaskComplete: !notificationSettings.agentTaskComplete
                    })
                  }
                />
                <NotificationSettingToggle
                  label={translate(
                    'auto.components.settings.NotificationsPane.591fe605b9',
                    'Terminal Bell'
                  )}
                  description={translate(
                    'auto.components.settings.NotificationsPane.b6fc369244',
                    'A background terminal emits a bell character.'
                  )}
                  checked={notificationSettings.terminalBell}
                  disabled={!notificationSettings.enabled}
                  onToggle={() =>
                    void updateNotificationSettings({
                      terminalBell: !notificationSettings.terminalBell
                    })
                  }
                />
              </div>
            )
          },
          {
            id: 'notifications-sound',
            icon: <FileAudio aria-hidden="true" />,
            title: translate(
              'auto.components.settings.NotificationsPane.88686e6ca8',
              'Notification Sound'
            ),
            searchEntries: getNotificationSoundSearchEntries(),
            content: (
              <NotificationSoundSection
                notificationSettings={notificationSettings}
                notificationsEnabled={notificationSettings.enabled}
                volumeDraft={volumeDraft}
                onVolumeDraftChange={setVolumeDraft}
                onVolumeCommit={handleVolumeCommit}
                onUpdateNotificationSettings={updateNotificationSettings}
              />
            )
          }
        ]}
      />
    </div>
  )
}
