import type { NotificationSettings } from '@yiru/protocol/settings/notifications'

import beepUrl from './assets/beep.mp3?url'
import blipUrl from './assets/blip.mp3?url'
import blopUrl from './assets/blop.mp3?url'
import bongUrl from './assets/bong.mp3?url'
import clackUrl from './assets/clack.mp3?url'
import dingUrl from './assets/ding.mp3?url'
import sonarUrl from './assets/sonar.mp3?url'
import thumpUrl from './assets/thump.mp3?url'
import twoToneUrl from './assets/two-tone.mp3?url'

export function getBuiltInNotificationSoundUrl(
  soundId: NotificationSettings['customSoundId']
): string | null {
  switch (soundId) {
    case 'beep':
      return beepUrl
    case 'blip':
      return blipUrl
    case 'blop':
      return blopUrl
    case 'bong':
      return bongUrl
    case 'clack':
      return clackUrl
    case 'ding':
      return dingUrl
    case 'sonar':
      return sonarUrl
    case 'thump':
      return thumpUrl
    case 'two-tone':
      return twoToneUrl
    case 'custom':
    case 'system':
      return null
  }
}
