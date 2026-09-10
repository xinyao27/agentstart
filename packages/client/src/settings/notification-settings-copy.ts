import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { requireNotificationsTarget } from '~renderer/runtime/notifications-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'

type SystemNotificationSettingsCopy = {
  failureTitle: string
  failureDescription: string
}

function getSystemNotificationSettingsCopy(
  platform: NodeJS.Platform
): SystemNotificationSettingsCopy | null {
  if (platform === 'darwin') {
    return {
      failureTitle: 'macOS did not show the notification',
      failureDescription: 'Enable Allow notifications for AgentStart in System Settings.'
    }
  }

  if (platform === 'win32') {
    return {
      failureTitle: 'Windows did not show the notification',
      failureDescription: 'Enable notifications for AgentStart in Windows Settings.'
    }
  }

  return null
}

export type NotificationVolumeDraftState = {
  sourceVolume: number
  draft: number
}

export function createNotificationVolumeDraftState(
  sourceVolume: number
): NotificationVolumeDraftState {
  return {
    sourceVolume,
    draft: sourceVolume
  }
}

export function resolveNotificationVolumeDraftState(
  state: NotificationVolumeDraftState,
  sourceVolume: number
): NotificationVolumeDraftState {
  return state.sourceVolume === sourceVolume
    ? state
    : createNotificationVolumeDraftState(sourceVolume)
}

export type NotificationTestOutcome = 'delivered' | 'not-displayed' | 'not-sent'

type SendTestNotificationOptions = {
  /** Why: the onboarding step renders delivery state inline, so the ambiguous
   *  darwin "check if a banner appeared" toasts would just duplicate (or
   *  contradict) the card the user is already looking at. */
  suppressSystemPermissionToasts?: boolean
}

export async function sendNotificationSettingsTestNotification(
  notificationSettings: GlobalSettings['notifications'],
  volumeDraft: number,
  options?: SendTestNotificationOptions
): Promise<NotificationTestOutcome> {
  const permissionStatus = await shellClient.notifications.getPermissionStatus()
  if (!permissionStatus.supported) {
    toast.error(
      translate(
        'auto.components.settings.NotificationsPane.c83b05a055',
        'Notifications are not supported on this system'
      )
    )
    return 'not-sent'
  }

  const target = getActiveRuntimeTarget(useAppStore.getState().settings)
  const result = await (
    await requireNotificationsTarget(target)
  ).report({
    source: 'test',
    requireDisplayConfirmation: true
  })
  if (result.delivered) {
    const soundResult =
      notificationSettings.customSoundId !== 'system'
        ? await shellClient.notifications.playSound({
            force: true,
            soundId: notificationSettings.customSoundId,
            volume: volumeDraft
          })
        : null
    if (notificationSettings.customSoundId !== 'system' && soundResult && !soundResult.played) {
      toast.error(
        translate(
          'auto.components.settings.NotificationsPane.98d70fb261',
          'Custom notification sound could not be played'
        )
      )
      return 'delivered'
    }
    if (options?.suppressSystemPermissionToasts) {
      return 'delivered'
    }
    const settingsCopy = getSystemNotificationSettingsCopy(permissionStatus.platform)
    if (permissionStatus.platform === 'darwin' && settingsCopy) {
      toast.message(
        translate(
          'auto.components.settings.NotificationsPane.7f45542625',
          'Test notification requested'
        ),
        {
          description: translate(
            'auto.components.settings.NotificationsPane.115437bc35',
            'If no macOS banner appeared, enable Allow notifications for AgentStart.'
          ),
          action: {
            label: translate(
              'auto.components.settings.NotificationsPane.145227ca2b',
              'Open Settings'
            ),
            onClick: () => {
              void shellClient.notifications.openSystemSettings()
            }
          }
        }
      )
      return 'delivered'
    }
    toast.success(
      translate('auto.components.settings.NotificationsPane.d3d54e0915', 'Test notification sent')
    )
    return 'delivered'
  }

  if (result.reason === 'not-displayed' || result.reason === 'blocked-by-system') {
    if (options?.suppressSystemPermissionToasts) {
      return 'not-displayed'
    }
    const settingsCopy = getSystemNotificationSettingsCopy(permissionStatus.platform)
    if (settingsCopy) {
      toast.error(settingsCopy.failureTitle, {
        description: settingsCopy.failureDescription,
        action: {
          label: translate(
            'auto.components.settings.NotificationsPane.145227ca2b',
            'Open Settings'
          ),
          onClick: () => {
            void shellClient.notifications.openSystemSettings()
          }
        }
      })
    } else {
      toast.error(
        translate(
          'auto.components.settings.NotificationsPane.0cb93240b8',
          'System did not show the notification'
        ),
        {
          description: translate(
            'auto.components.settings.NotificationsPane.4676a95bc3',
            'Check your system notification settings for AgentStart.'
          )
        }
      )
    }
    return 'not-displayed'
  }

  toast.error(
    result.reason === 'disabled'
      ? translate(
          'auto.components.settings.NotificationsPane.6fc3781729',
          'Notifications are disabled'
        )
      : translate(
          'auto.components.settings.NotificationsPane.406feb0aa6',
          'Test notification was not delivered'
        )
  )
  return 'not-sent'
}
