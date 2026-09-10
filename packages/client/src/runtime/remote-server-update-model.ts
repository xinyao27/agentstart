import type {
  UpdaterCheckOptions,
  UpdaterInstallResult,
  UpdaterSnapshot,
  UpdaterStatusSubscription,
  UpdaterSupport
} from '@agentstart/protocol'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import type { RuntimeStatus } from '~renderer/runtime/status/model'

export type RemoteServerUpdatePhase =
  | 'checking'
  | 'available'
  | 'current'
  | 'manual'
  | 'offline'
  | 'queued'
  | 'checking-update'
  | 'downloading'
  | 'restarting'
  | 'updated'
  | 'failed'

export type RemoteServerUpdateEntry = {
  environmentId: string
  name: string
  phase: RemoteServerUpdatePhase
  currentVersion: string | null
  targetVersion: string | null
  progress: number | null
  runtimeId: string | null
  liveTabCount: number
  liveLeafCount: number
  support: UpdaterSupport | null
  error: string | null
}

export type RemoteServerUpdateTransport = {
  getRuntimeStatus: (environmentId: string, timeoutMs?: number) => Promise<RuntimeStatus>
  subscribeStatus: (environmentId: string, timeoutMs: number) => Promise<UpdaterStatusSubscription>
  check: (environmentId: string, options: UpdaterCheckOptions) => Promise<UpdaterSnapshot>
  download: (environmentId: string) => Promise<UpdaterSnapshot>
  install: (environmentId: string) => Promise<UpdaterInstallResult>
  wait: (milliseconds: number) => Promise<void>
  now?: () => number
}

export type RemoteServerUpdateTiming = {
  operationTimeoutMs: number
  reconnectTimeoutMs: number
  pollIntervalMs: number
}

export const DEFAULT_REMOTE_SERVER_UPDATE_TIMING: RemoteServerUpdateTiming = {
  operationTimeoutMs: 10 * 60 * 1000,
  reconnectTimeoutMs: 3 * 60 * 1000,
  pollIntervalMs: 500
}

export type RemoteServerUpdateRunOptions = {
  checkOptions?: UpdaterCheckOptions
  timing?: RemoteServerUpdateTiming
}

export function checkingRemoteServerUpdateEntry(
  environment: PublicKnownRuntimeEnvironment
): RemoteServerUpdateEntry {
  return {
    environmentId: environment.id,
    name: environment.name,
    phase: 'checking',
    currentVersion: null,
    targetVersion: null,
    progress: null,
    runtimeId: null,
    liveTabCount: 0,
    liveLeafCount: 0,
    support: null,
    error: null
  }
}
