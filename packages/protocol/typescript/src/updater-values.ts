import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  UpdaterInstallMode as ProtocolUpdaterInstallMode,
  UpdaterSupportReason as ProtocolUpdaterSupportReason,
  type UpdaterChangelog as ProtocolUpdaterChangelog,
  type UpdaterSnapshot as ProtocolUpdaterSnapshot,
  type UpdaterStatus as ProtocolUpdaterStatus,
  type UpdaterSupport as ProtocolUpdaterSupport
} from '../generated/agent_start/runtime/v1/updater_pb.js'
import { RuntimeProtocolError } from './error.js'

export const UPDATER_PROTOCOL_CAPABILITY = 'updater.protobuf.v1' as const

export type UpdaterCheckOptions = {
  includePrerelease?: boolean
  includePerfPrerelease?: boolean
}

export type UpdaterChangelogRelease = {
  title: string
  description: string
  mediaUrl?: string
  releaseNotesUrl: string
}

export type UpdaterChangelog = {
  release: UpdaterChangelogRelease
  releasesBehind: number | null
}

export type UpdaterStatus =
  | { state: 'idle' }
  | { state: 'checking'; userInitiated?: boolean }
  | {
      state: 'available'
      version: string
      activeNudgeId?: string
      releaseUrl?: string
      changelog: UpdaterChangelog | null
    }
  | { state: 'not-available'; userInitiated?: boolean }
  | { state: 'downloading'; percent: number; version: string; activeNudgeId?: string }
  | { state: 'downloaded'; version: string; releaseUrl?: string; activeNudgeId?: string }
  | { state: 'error'; message: string; userInitiated?: boolean; activeNudgeId?: string }

export type UpdaterInstallMode =
  | 'interactive'
  | 'supervised-headless-serve'
  | 'unsupported-headless-serve'

export type UpdaterSupport = {
  installMode: UpdaterInstallMode
  automatic: boolean
  reason:
    | 'available'
    | 'manual-service-update-required'
    | 'unpackaged-build'
    | 'updater-unavailable'
}

export type UpdaterSnapshot = {
  appVersion: string
  runtimeId: string
  support: UpdaterSupport
  status: UpdaterStatus
}

export type UpdaterInstallResult = {
  accepted: true
  fromVersion: string
  targetVersion: string
  runtimeId: string
}

export type UpdaterStatusSubscription = {
  snapshots: AsyncIterable<UpdaterSnapshot>
  cancel: (reason?: string) => Promise<void>
}

export function updaterSnapshot(snapshot: ProtocolUpdaterSnapshot | undefined): UpdaterSnapshot {
  if (!snapshot?.support || !snapshot.status) {
    throw invalidUpdaterResponse('Updater snapshot is incomplete')
  }
  return {
    appVersion: requiredUpdaterText(snapshot.appVersion, 'Updater app version is missing'),
    runtimeId: requiredUpdaterText(snapshot.runtimeId, 'Updater runtime identity is missing'),
    support: updaterSupport(snapshot.support),
    status: updaterStatus(snapshot.status)
  }
}

function updaterSupport(support: ProtocolUpdaterSupport): UpdaterSupport {
  return {
    installMode: updaterInstallMode(support.installMode),
    automatic: support.automatic,
    reason: updaterSupportReason(support.reason)
  }
}

function updaterInstallMode(value: ProtocolUpdaterInstallMode): UpdaterInstallMode {
  switch (value) {
    case ProtocolUpdaterInstallMode.INTERACTIVE:
      return 'interactive'
    case ProtocolUpdaterInstallMode.SUPERVISED_HEADLESS_SERVE:
      return 'supervised-headless-serve'
    case ProtocolUpdaterInstallMode.UNSUPPORTED_HEADLESS_SERVE:
      return 'unsupported-headless-serve'
    case ProtocolUpdaterInstallMode.UNSPECIFIED:
      throw invalidUpdaterResponse('Updater install mode is unspecified')
  }
  throw invalidUpdaterResponse('Updater install mode is unknown')
}

function updaterSupportReason(value: ProtocolUpdaterSupportReason): UpdaterSupport['reason'] {
  switch (value) {
    case ProtocolUpdaterSupportReason.AVAILABLE:
      return 'available'
    case ProtocolUpdaterSupportReason.MANUAL_SERVICE_UPDATE_REQUIRED:
      return 'manual-service-update-required'
    case ProtocolUpdaterSupportReason.UNPACKAGED_BUILD:
      return 'unpackaged-build'
    case ProtocolUpdaterSupportReason.UPDATER_UNAVAILABLE:
      return 'updater-unavailable'
    case ProtocolUpdaterSupportReason.UNSPECIFIED:
      throw invalidUpdaterResponse('Updater support reason is unspecified')
  }
  throw invalidUpdaterResponse('Updater support reason is unknown')
}

function updaterStatus(status: ProtocolUpdaterStatus): UpdaterStatus {
  switch (status.state.case) {
    case 'idle':
      return { state: 'idle' }
    case 'checking':
      return {
        state: 'checking',
        ...(status.state.value.userInitiated === undefined
          ? {}
          : { userInitiated: status.state.value.userInitiated })
      }
    case 'available': {
      const value = status.state.value
      return {
        state: 'available',
        version: requiredUpdaterText(value.version, 'Available updater version is missing'),
        ...(value.activeNudgeId === undefined ? {} : { activeNudgeId: value.activeNudgeId }),
        ...(value.releaseUrl === undefined ? {} : { releaseUrl: value.releaseUrl }),
        changelog: value.changelog ? updaterChangelog(value.changelog) : null
      }
    }
    case 'notAvailable':
      return {
        state: 'not-available',
        ...(status.state.value.userInitiated === undefined
          ? {}
          : { userInitiated: status.state.value.userInitiated })
      }
    case 'downloading': {
      const value = status.state.value
      if (value.percent > 100) {
        throw invalidUpdaterResponse('Updater download percentage is out of range')
      }
      return {
        state: 'downloading',
        percent: value.percent,
        version: requiredUpdaterText(value.version, 'Downloading updater version is missing'),
        ...(value.activeNudgeId === undefined ? {} : { activeNudgeId: value.activeNudgeId })
      }
    }
    case 'downloaded': {
      const value = status.state.value
      return {
        state: 'downloaded',
        version: requiredUpdaterText(value.version, 'Downloaded updater version is missing'),
        ...(value.releaseUrl === undefined ? {} : { releaseUrl: value.releaseUrl }),
        ...(value.activeNudgeId === undefined ? {} : { activeNudgeId: value.activeNudgeId })
      }
    }
    case 'error': {
      const value = status.state.value
      return {
        state: 'error',
        message: requiredUpdaterText(value.message, 'Updater error message is missing'),
        ...(value.userInitiated === undefined ? {} : { userInitiated: value.userInitiated }),
        ...(value.activeNudgeId === undefined ? {} : { activeNudgeId: value.activeNudgeId })
      }
    }
    case undefined:
      throw invalidUpdaterResponse('Updater status state is missing or unknown')
  }
}

function updaterChangelog(changelog: ProtocolUpdaterChangelog): UpdaterChangelog {
  const release = changelog.release
  if (!release) {
    throw invalidUpdaterResponse('Updater changelog release is missing')
  }
  return {
    release: {
      title: release.title,
      description: release.description,
      ...(release.mediaUrl === undefined ? {} : { mediaUrl: release.mediaUrl }),
      releaseNotesUrl: release.releaseNotesUrl
    },
    releasesBehind:
      changelog.releasesBehind === undefined
        ? null
        : exactNonnegativeSafeInteger(
            changelog.releasesBehind,
            'Updater releases behind is out of range'
          )
  }
}

function exactNonnegativeSafeInteger(value: bigint, message: string): number {
  const number = Number(value)
  if (number < 0 || !Number.isSafeInteger(number) || BigInt(number) !== value) {
    throw invalidUpdaterResponse(message)
  }
  return number
}

export function requiredUpdaterText(value: string, message: string): string {
  if (!value.trim()) {
    throw invalidUpdaterResponse(message)
  }
  return value
}

export function invalidUpdaterResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
