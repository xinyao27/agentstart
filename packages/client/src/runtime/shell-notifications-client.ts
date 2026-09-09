import type { NotificationSettings } from '@yiru/protocol/settings/notifications'
import type {
  NotificationDismissResult,
  NotificationDisplayInput,
  NotificationDisplayResult
} from '~renderer/extension/notification-request'
import type {
  NotificationDeliveryProbeResult,
  NotificationPermissionStatusResult
} from '~renderer/notifications/permission-model'
import { getBuiltInNotificationSoundUrl } from '~renderer/notifications/sound-assets'

import { readConfiguredBrowserHostNotificationSound } from './browser-host-runtime'

type NotificationSoundFailureReason =
  | 'missing-path'
  | 'invalid-path'
  | 'unsupported-type'
  | 'too-large'
  | 'read-failed'
  | 'playback-failed'
  | 'deduped'

type NotificationSoundResult = {
  played: boolean
  reason?: NotificationSoundFailureReason
}

type CachedSound =
  | { kind: 'built-in'; sourceUrl: string; audio: HTMLAudioElement }
  | { kind: 'custom'; assetId: string; blobUrl: string; audio: HTMLAudioElement }

export type ShellNotificationsApi = {
  displayNative: (args: NotificationDisplayInput) => Promise<NotificationDisplayResult>
  dismissNative: (notificationIds: string[]) => Promise<NotificationDismissResult>
  openSystemSettings: () => Promise<void>
  getPermissionStatus: () => Promise<NotificationPermissionStatusResult>
  probeDelivery: (args?: { force?: boolean }) => Promise<NotificationDeliveryProbeResult>
  playSound: (options: {
    soundId: NotificationSettings['customSoundId']
    force?: boolean
    volume?: number
  }) => Promise<NotificationSoundResult>
}

let cachedSound: CachedSound | null = null
let isSoundPlaying = false
let cleanupPlayback: (() => void) | null = null

function clearPlaybackState(): void {
  cleanupPlayback?.()
  cleanupPlayback = null
  isSoundPlaying = false
}

function disposeCachedSound(): void {
  if (!cachedSound) {
    return
  }
  clearPlaybackState()
  cachedSound.audio.pause()
  cachedSound.audio.src = ''
  if (cachedSound.kind === 'custom') {
    URL.revokeObjectURL(cachedSound.blobUrl)
  }
  cachedSound = null
}

async function playSound(options: {
  soundId: NotificationSettings['customSoundId']
  force?: boolean
  volume?: number
}): Promise<NotificationSoundResult> {
  try {
    if (!options.force && isSoundPlaying) {
      return { played: false, reason: 'deduped' }
    }
    const entry = await resolveSound(options.soundId)
    if (!entry.ok) {
      return { played: false, reason: entry.reason }
    }

    const audio = entry.sound.audio
    audio.currentTime = 0
    if (typeof options.volume === 'number' && Number.isFinite(options.volume)) {
      audio.volume = Math.min(1, Math.max(0, options.volume / 100))
    }
    isSoundPlaying = true
    cleanupPlayback?.()
    const cleanup = (): void => {
      audio.removeEventListener('ended', release)
      audio.removeEventListener('error', release)
    }
    const release = (): void => {
      cleanup()
      if (cleanupPlayback === cleanup) {
        cleanupPlayback = null
      }
      isSoundPlaying = false
    }
    cleanupPlayback = cleanup
    audio.addEventListener('ended', release)
    audio.addEventListener('error', release)
    try {
      await audio.play()
    } catch {
      release()
      return { played: false, reason: 'playback-failed' }
    }
    return { played: true }
  } catch {
    clearPlaybackState()
    return { played: false, reason: 'playback-failed' }
  }
}

async function resolveSound(
  soundId: NotificationSettings['customSoundId']
): Promise<
  { ok: true; sound: CachedSound } | { ok: false; reason: NotificationSoundFailureReason }
> {
  const builtInUrl = getBuiltInNotificationSoundUrl(soundId)
  if (builtInUrl) {
    if (cachedSound?.kind !== 'built-in' || cachedSound.sourceUrl !== builtInUrl) {
      disposeCachedSound()
      cachedSound = { kind: 'built-in', sourceUrl: builtInUrl, audio: new Audio(builtInUrl) }
    }
    return { ok: true, sound: cachedSound }
  }
  if (soundId !== 'custom') {
    disposeCachedSound()
    return { ok: false, reason: 'missing-path' }
  }
  const cachedAssetId = cachedSound?.kind === 'custom' ? cachedSound.assetId : undefined
  const result = await readConfiguredBrowserHostNotificationSound(cachedAssetId)
  if (result.state === 'unavailable') {
    disposeCachedSound()
    return { ok: false, reason: result.reason }
  }
  if (result.state === 'not-modified') {
    if (cachedSound?.kind !== 'custom') {
      return { ok: false, reason: 'read-failed' }
    }
    return { ok: true, sound: cachedSound }
  }
  const arrayBuffer = new ArrayBuffer(result.data.byteLength)
  new Uint8Array(arrayBuffer).set(result.data)
  const blob = new Blob([arrayBuffer], { type: result.mimeType })
  disposeCachedSound()
  const blobUrl = URL.createObjectURL(blob)
  cachedSound = {
    kind: 'custom',
    assetId: result.assetId,
    blobUrl,
    audio: new Audio(blobUrl)
  }
  return { ok: true, sound: cachedSound }
}

export const daemonShellNotificationsApi: Pick<ShellNotificationsApi, 'playSound'> = {
  playSound
}
