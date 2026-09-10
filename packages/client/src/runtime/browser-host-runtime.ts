import type {
  LocalDownloadClient,
  NotificationSoundLoadResult,
  RuntimeTransport
} from '@agentstart/protocol'
import type { MemorySnapshot } from '@agentstart/protocol/diagnostics/memory-values'
import type { StatsSummaryInput } from '@agentstart/protocol/stats/client'
import type { StatsSummaryResult } from '@agentstart/protocol/stats/values'
import type { RuntimeStatusResult } from '~renderer/runtime/status/model'

type BrowserHostAppControl = {
  restart: (timeoutMs?: number) => Promise<void>
  recordStartupDiagnostic: (
    event: string,
    details?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<void>
}
type BrowserHostDiagnosticsReader = (timeoutMs?: number) => Promise<MemorySnapshot>
type BrowserHostLocalDownloadConnection = () => Promise<LocalDownloadClient>
type BrowserHostNotificationSoundReader = (
  cachedAssetId?: string
) => Promise<NotificationSoundLoadResult>
type BrowserHostProtocolConnection = () => Promise<RuntimeTransport>
type BrowserHostStatsReader = (
  input: StatsSummaryInput,
  timeoutMs?: number
) => Promise<StatsSummaryResult>
type BrowserHostStatusReader = (timeoutMs?: number) => Promise<RuntimeStatusResult>
export type BrowserHostTerminalMultiplexHandle = {
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
  unsubscribe: () => void
}
export type BrowserHostTerminalMultiplexOptions = {
  clientInstanceId: string
  environmentIdentity: string
  onBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
  onClose: () => void
  onError: (error: Error) => void
  onReady: () => void
}
type BrowserHostTerminalMultiplex = (
  options: BrowserHostTerminalMultiplexOptions
) => Promise<BrowserHostTerminalMultiplexHandle>

let browserHostAppControl: BrowserHostAppControl | null = null
let readBrowserHostDiagnostics: BrowserHostDiagnosticsReader | null = null
let openBrowserHostLocalDownloads: BrowserHostLocalDownloadConnection | null = null
let readBrowserHostNotificationSound: BrowserHostNotificationSoundReader | null = null
let openBrowserHostProtocol: BrowserHostProtocolConnection | null = null
let isBrowserHostLocalDevice: (() => boolean) | null = null
let readBrowserHostStats: BrowserHostStatsReader | null = null
let readBrowserHostStatus: BrowserHostStatusReader | null = null
let openBrowserHostTerminalMultiplex: BrowserHostTerminalMultiplex | null = null

export function configureBrowserHostAppControl(control: BrowserHostAppControl): void {
  browserHostAppControl = control
}

export function restartConfiguredBrowserHost(timeoutMs?: number): Promise<void> {
  if (!browserHostAppControl) {
    return Promise.reject(new Error('browser_host_app_control_not_configured'))
  }
  return browserHostAppControl.restart(timeoutMs)
}

export function recordConfiguredBrowserHostStartupDiagnostic(
  event: string,
  details?: Record<string, unknown>,
  timeoutMs?: number
): Promise<void> {
  if (!browserHostAppControl) {
    return Promise.reject(new Error('browser_host_app_control_not_configured'))
  }
  return browserHostAppControl.recordStartupDiagnostic(event, details, timeoutMs)
}

export function configureBrowserHostDiagnostics(reader: BrowserHostDiagnosticsReader): void {
  readBrowserHostDiagnostics = reader
}

export function readConfiguredBrowserHostDiagnostics(timeoutMs?: number): Promise<MemorySnapshot> {
  if (!readBrowserHostDiagnostics) {
    return Promise.reject(new Error('browser_host_runtime_diagnostics_not_configured'))
  }
  return readBrowserHostDiagnostics(timeoutMs)
}

export function configureBrowserHostLocalDownloads(
  openConnection: BrowserHostLocalDownloadConnection
): void {
  openBrowserHostLocalDownloads = openConnection
}

export function openConfiguredBrowserHostLocalDownloads(): Promise<LocalDownloadClient> {
  if (!openBrowserHostLocalDownloads) {
    return Promise.reject(new Error('browser_host_local_downloads_not_configured'))
  }
  return openBrowserHostLocalDownloads()
}

export function configureBrowserHostNotificationSounds(
  reader: BrowserHostNotificationSoundReader
): void {
  readBrowserHostNotificationSound = reader
}

export function readConfiguredBrowserHostNotificationSound(
  cachedAssetId?: string
): Promise<NotificationSoundLoadResult> {
  if (!readBrowserHostNotificationSound) {
    return Promise.reject(new Error('browser_host_notification_sound_not_configured'))
  }
  return readBrowserHostNotificationSound(cachedAssetId)
}

export function configureBrowserHostProtocol(
  openConnection: BrowserHostProtocolConnection,
  isLocalDevice: () => boolean
): void {
  openBrowserHostProtocol = openConnection
  isBrowserHostLocalDevice = isLocalDevice
}

export function isConfiguredBrowserHostLocalDevice(): boolean {
  return isBrowserHostLocalDevice?.() ?? false
}

export function openConfiguredBrowserHostProtocol(): Promise<RuntimeTransport> {
  if (!openBrowserHostProtocol) {
    return Promise.reject(new Error('browser_host_protocol_not_configured'))
  }
  return openBrowserHostProtocol()
}

export function configureBrowserHostStats(reader: BrowserHostStatsReader): void {
  readBrowserHostStats = reader
}

export function readConfiguredBrowserHostStats(
  input: StatsSummaryInput,
  timeoutMs?: number
): Promise<StatsSummaryResult> {
  if (!readBrowserHostStats) {
    return Promise.reject(new Error('browser_host_runtime_stats_not_configured'))
  }
  return readBrowserHostStats(input, timeoutMs)
}

export function configureBrowserHostStatus(reader: BrowserHostStatusReader): void {
  readBrowserHostStatus = reader
}

export function readConfiguredBrowserHostStatus(timeoutMs?: number): Promise<RuntimeStatusResult> {
  if (!readBrowserHostStatus) {
    return Promise.reject(new Error('browser_host_runtime_status_not_configured'))
  }
  return readBrowserHostStatus(timeoutMs)
}

export function configureBrowserHostTerminalMultiplex(
  openMultiplex: BrowserHostTerminalMultiplex
): void {
  openBrowserHostTerminalMultiplex = openMultiplex
}

export function openConfiguredBrowserHostTerminalMultiplex(
  options: BrowserHostTerminalMultiplexOptions
): Promise<BrowserHostTerminalMultiplexHandle> {
  if (!openBrowserHostTerminalMultiplex) {
    return Promise.reject(new Error('browser_host_terminal_multiplex_not_configured'))
  }
  return openBrowserHostTerminalMultiplex(options)
}
