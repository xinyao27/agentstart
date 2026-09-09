import type { NotificationSettings } from '@yiru/protocol/settings/notifications'
import { shellClient } from '~renderer/runtime/shell-client'

export async function playNotificationSound(
  customSoundId: NotificationSettings['customSoundId'] | null | undefined,
  customSoundVolume?: number | null
): Promise<boolean> {
  if (!customSoundId || customSoundId === 'system') {
    return false
  }

  try {
    const result = await shellClient.notifications.playSound({
      soundId: customSoundId,
      volume: customSoundVolume ?? undefined
    })
    // Why: 'deduped' is expected when bursts of notifications coalesce — not a failure.
    if (!result.played && result.reason !== 'deduped') {
      console.warn('Failed to play custom notification sound:', result.reason)
    }
    return result.played
  } catch (err) {
    console.warn('Failed to play custom notification sound:', err)
    return false
  }
}
