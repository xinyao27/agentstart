import {
  RemoteControlState,
  RemoteUpdateInstallMode,
  RemoteUpdateReason,
  RuntimeDeviceScope,
  RuntimeGraphStatus,
  type GetStatusResponse,
  type RemoteControlDiagnostics,
  type RemoteUpdateSupport
} from '@yiru/protocol'
import type {
  RuntimeDeviceScope as RuntimeDeviceScopeName,
  RuntimeGraphStatus as RuntimeGraphStatusName,
  RuntimeHostPlatformName,
  RuntimeRemoteControlDiagnostics,
  RuntimeRemoteUpdateSupport,
  RuntimeStatusResult
} from '~renderer/runtime/status/model'

export function mapProtocolStatus(status: GetStatusResponse): RuntimeStatusResult {
  const hostPlatform = hostPlatformName(status.hostPlatform)
  const deviceScope = deviceScopeName(status.deviceScope)
  const updateSupport = status.remoteUpdateSupport
    ? remoteUpdateSupport(status.remoteUpdateSupport)
    : undefined
  const remoteControl = status.remoteControl
    ? remoteControlDiagnostics(status.remoteControl)
    : undefined
  return {
    runtimeId: status.runtimeId,
    rendererGraphEpoch: safeInteger(status.rendererGraphEpoch, 'renderer_graph_epoch'),
    graphStatus: graphStatusName(status.graphStatus),
    authoritativeWindowId:
      status.authoritativeWindowId === undefined
        ? null
        : safeInteger(status.authoritativeWindowId, 'authoritative_window_id'),
    liveTabCount: status.liveTabCount,
    liveLeafCount: status.liveLeafCount,
    runtimeProtocolVersion: status.runtimeApiVersion,
    minCompatibleRuntimeClientVersion: status.minCompatibleRuntimeClientVersion,
    capabilities: status.capabilities,
    ...(status.appVersion ? { appVersion: status.appVersion } : {}),
    ...(updateSupport ? { remoteUpdateSupport: updateSupport } : {}),
    ...(remoteControl ? { remoteControl } : {}),
    ...(hostPlatform ? { hostPlatform } : {}),
    ...(status.terminalWindowsShell !== undefined
      ? { terminalWindowsShell: status.terminalWindowsShell }
      : {}),
    ...(deviceScope ? { deviceScope } : {})
  }
}

function safeInteger(value: bigint, field: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Runtime status ${field} exceeds JavaScript's safe integer range.`)
  }
  return number
}

function graphStatusName(status: RuntimeGraphStatus): RuntimeGraphStatusName {
  switch (status) {
    case RuntimeGraphStatus.READY:
      return 'ready'
    case RuntimeGraphStatus.RELOADING:
      return 'reloading'
    case RuntimeGraphStatus.UNAVAILABLE:
      return 'unavailable'
    case RuntimeGraphStatus.UNSPECIFIED:
      throw new Error('Runtime returned an unspecified graph status.')
  }
  return 'unavailable'
}

function remoteUpdateSupport(support: RemoteUpdateSupport): RuntimeRemoteUpdateSupport | undefined {
  const installMode = remoteUpdateInstallMode(support.installMode)
  const reason = remoteUpdateReason(support.reason)
  if (!installMode || !reason) {
    return undefined
  }
  return {
    installMode,
    automatic: support.automatic,
    reason
  }
}

function remoteUpdateInstallMode(
  mode: RemoteUpdateInstallMode
): RuntimeRemoteUpdateSupport['installMode'] | undefined {
  switch (mode) {
    case RemoteUpdateInstallMode.INTERACTIVE:
      return 'interactive'
    case RemoteUpdateInstallMode.SUPERVISED_HEADLESS_SERVE:
      return 'supervised-headless-serve'
    case RemoteUpdateInstallMode.UNSUPPORTED_HEADLESS_SERVE:
      return 'unsupported-headless-serve'
    case RemoteUpdateInstallMode.UNSPECIFIED:
      throw new Error('Runtime returned an unspecified update install mode.')
  }
  return undefined
}

function remoteUpdateReason(
  reason: RemoteUpdateReason
): RuntimeRemoteUpdateSupport['reason'] | undefined {
  switch (reason) {
    case RemoteUpdateReason.AVAILABLE:
      return 'available'
    case RemoteUpdateReason.MANUAL_SERVICE_UPDATE_REQUIRED:
      return 'manual-service-update-required'
    case RemoteUpdateReason.UNPACKAGED_BUILD:
      return 'unpackaged-build'
    case RemoteUpdateReason.UPDATER_UNAVAILABLE:
      return 'updater-unavailable'
    case RemoteUpdateReason.UNSPECIFIED:
      throw new Error('Runtime returned an unspecified update reason.')
  }
  return undefined
}

function remoteControlDiagnostics(
  diagnostics: RemoteControlDiagnostics
): RuntimeRemoteControlDiagnostics | undefined {
  const state = remoteControlState(diagnostics.state)
  if (!state) {
    return undefined
  }
  return {
    state,
    pendingRequestCount: diagnostics.pendingRequestCount,
    subscriptionCount: diagnostics.subscriptionCount,
    reconnectAttempt: diagnostics.reconnectAttempt,
    lastConnectedAt:
      diagnostics.lastConnectedAtUnixMs === undefined
        ? null
        : safeInteger(diagnostics.lastConnectedAtUnixMs, 'last_connected_at_unix_ms'),
    lastClose: diagnostics.lastClose
      ? { code: diagnostics.lastClose.code, reason: diagnostics.lastClose.reason }
      : null,
    lastError: diagnostics.lastError ?? null
  }
}

function remoteControlState(
  state: RemoteControlState
): RuntimeRemoteControlDiagnostics['state'] | undefined {
  switch (state) {
    case RemoteControlState.CLOSED:
      return 'closed'
    case RemoteControlState.AWAITING_READY:
      return 'awaiting_ready'
    case RemoteControlState.AWAITING_AUTHENTICATED:
      return 'awaiting_authenticated'
    case RemoteControlState.READY:
      return 'ready'
    case RemoteControlState.RECONNECTING:
      return 'reconnecting'
    case RemoteControlState.UNSPECIFIED:
      throw new Error('Runtime returned an unspecified remote-control state.')
  }
  return undefined
}

function deviceScopeName(scope: RuntimeDeviceScope): RuntimeDeviceScopeName | undefined {
  switch (scope) {
    case RuntimeDeviceScope.MOBILE:
      return 'mobile'
    case RuntimeDeviceScope.RUNTIME:
      return 'runtime'
    case RuntimeDeviceScope.UNSPECIFIED:
      return undefined
  }
  return undefined
}

function hostPlatformName(platform: string): RuntimeHostPlatformName | undefined {
  switch (platform) {
    case 'aix':
    case 'android':
    case 'darwin':
    case 'freebsd':
    case 'haiku':
    case 'linux':
    case 'openbsd':
    case 'sunos':
    case 'win32':
    case 'cygwin':
    case 'netbsd':
      return platform
  }
  return undefined
}
