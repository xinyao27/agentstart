import type { AgentType, ParsedAgentStatusPayload } from '@agentstart/protocol/agent/status-records'
import { isWslUncPath } from '@agentstart/protocol/host/wsl-paths'
import { CLIENT_PLATFORM } from '~renderer/new-workspace/workspace-creation'
import { useAppStore } from '~renderer/store/state'

import { RESET_KITTY_KEYBOARD_PROTOCOL, RESET_TERMINAL_CURSOR_STYLE } from '../layout-serialization'
import type { ManagedPane } from '../pane-manager/pane-manager'
import { createRuntimePtyTransport } from '../remote-runtime-pty-transport'
import { isPaneReplaying } from '../replay-guard'
import type { PtyConnectionDeps } from './connection-types'
import { createPaneEnvironment } from './pane-environment'
import { resolvePtyRuntimeContext } from './runtime-context'
import type { StartupLaunch } from './startup-launch'
import { createTransportIo, type TransportIo } from './transport-io'
import type { PtyTransport } from './transport-types'
import { installWindowsAgentModeReset } from './windows-agent-mode-reset'

type ConnectionTransportOptions = {
  pane: ManagedPane
  deps: PtyConnectionDeps
  paneKey: string
  startup: PtyConnectionDeps['startup']
  launch: StartupLaunch
  recoveryGeneration: number
  recoveryInstanceId: number
  getIsDisposed: () => boolean
  onPtyExit: (ptyId: string) => void
  onPtySpawn: (ptyId: string) => void
  onAgentStatus: (payload: ParsedAgentStatusPayload) => void
  setIdleModeReset: (data: string) => void
  setFocusReportSuppression: (title: string | undefined, agentType: AgentType | undefined) => void
  clearFocusReportSuppression: () => void
  queueIdleModeReset: () => void
}

export type ConnectionTransport = {
  transport: PtyTransport
  transportIo: TransportIo
  connectionId: string | null
  isNativeWindowsConpty: boolean
  runtimeEnvironmentId: string | null
  restoredPtyId: string | null
  resumePlatform: NodeJS.Platform
  paneIdentityEnv: Record<string, string>
  shouldDeliverStartupViaTerminalPaste: boolean
  hadExistingPaneTransportAtConnect: boolean
  shouldApplyWindowsRendererUnicodeRefresh: boolean
  disposeWindowsModeReset: () => void
}

export function createConnectionTransport(
  options: ConnectionTransportOptions
): ConnectionTransport {
  const state = useAppStore.getState()
  const paneIdentityEnv = createPaneEnvironment({
    paneKey: options.paneKey,
    tabId: options.deps.tabId,
    worktreeId: options.deps.worktreeId,
    launchToken: options.launch.launchToken ?? null,
    startupEnv: options.startup?.env
  })
  const {
    connectionId,
    isNativeWindowsConpty,
    projectRuntime,
    restoredPtyId,
    runtimeEnvironmentId,
    shellOverride,
    shouldApplyWindowsRendererUnicodeRefresh,
    shouldOwnAgentStatusInRenderer,
    worktree
  } = resolvePtyRuntimeContext({
    state,
    worktreeId: options.deps.worktreeId,
    tabId: options.deps.tabId,
    cwd: options.deps.cwd,
    restoredLeafId: options.deps.restoredLeafId,
    restoredPtyIdByLeafId: options.deps.restoredPtyIdByLeafId,
    clientPlatform: CLIENT_PLATFORM,
    userAgent: navigator.userAgent
  })
  if (isNativeWindowsConpty) {
    options.setIdleModeReset(`${RESET_TERMINAL_CURSOR_STYLE}${RESET_KITTY_KEYBOARD_PROTOCOL}`)
  }
  const disposeWindowsModeReset = installWindowsAgentModeReset({
    isEnabled: isNativeWindowsConpty,
    paneKey: options.paneKey,
    onDone: (agentType, didTransition) => {
      options.setFocusReportSuppression(undefined, agentType)
      if (didTransition) {
        options.queueIdleModeReset()
      }
    },
    onActive: options.clearFocusReportSuppression
  })
  const shouldDeliverStartupViaTerminalPaste = options.startup?.delivery === 'terminal-paste'
  const terminalTheme = options.pane.terminal.options.theme
  const terminalColorQueryReplies = terminalTheme
    ? { foreground: terminalTheme.foreground, background: terminalTheme.background }
    : undefined
  const transportOptions = {
    cwd: options.deps.cwd,
    ...(runtimeEnvironmentId === null && !connectionId ? { cwdFallback: 'worktree' as const } : {}),
    env: paneIdentityEnv,
    command: shouldDeliverStartupViaTerminalPaste ? undefined : options.startup?.command,
    startupCommandDelivery: shouldDeliverStartupViaTerminalPaste
      ? undefined
      : options.startup?.startupCommandDelivery,
    connectionId,
    worktreeId: options.deps.worktreeId,
    tabId: options.deps.tabId,
    leafId: options.pane.leafId,
    activate: options.deps.isActiveRef.current && options.deps.isVisibleRef.current,
    ...(shellOverride ? { shellOverride } : {}),
    ...(projectRuntime ? { projectRuntime } : {}),
    ...(terminalColorQueryReplies ? { terminalColorQueryReplies } : {}),
    ...(options.startup?.launchConfig ? { launchConfig: options.startup.launchConfig } : {}),
    ...(options.launch.launchToken ? { launchToken: options.launch.launchToken } : {}),
    ...(options.startup?.launchAgent ? { launchAgent: options.startup.launchAgent } : {}),
    ...(options.startup?.telemetry ? { telemetry: options.startup.telemetry } : {}),
    onPtyExit: options.onPtyExit,
    onPtySpawn: options.onPtySpawn,
    ...(shouldOwnAgentStatusInRenderer ? { onAgentStatus: options.onAgentStatus } : {})
  }
  const runtimeTarget = runtimeEnvironmentId
    ? ({ kind: 'environment', environmentId: runtimeEnvironmentId } as const)
    : ({ kind: 'local' } as const)
  const transport = createRuntimePtyTransport(runtimeTarget, transportOptions)
  const hadExistingPaneTransportAtConnect = options.deps.paneTransportsRef.current.size > 0
  options.deps.paneTransportsRef.current.set(options.pane.id, transport)
  const transportIo = createTransportIo({
    pane: options.pane,
    transport,
    tabId: options.deps.tabId,
    recoveryGeneration: options.recoveryGeneration,
    recoveryInstanceId: options.recoveryInstanceId,
    isNativeWindowsConpty,
    getIsDisposed: options.getIsDisposed,
    getIsReplaying: () => isPaneReplaying(options.deps.replayingPanesRef, options.pane.id),
    recordMode2031Subscription: (mode) =>
      options.deps.recordPaneMode2031Subscription?.(options.pane.id, mode)
  })
  const resumePlatform: NodeJS.Platform =
    projectRuntime?.status === 'repair-required'
      ? projectRuntime.repair.preferredRuntime.kind === 'wsl'
        ? 'linux'
        : CLIENT_PLATFORM
      : projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl'
        ? 'linux'
        : connectionId || (worktree?.path && isWslUncPath(worktree.path))
          ? 'linux'
          : CLIENT_PLATFORM

  return {
    transport,
    transportIo,
    connectionId,
    isNativeWindowsConpty,
    runtimeEnvironmentId,
    restoredPtyId,
    resumePlatform,
    paneIdentityEnv,
    shouldDeliverStartupViaTerminalPaste,
    hadExistingPaneTransportAtConnect,
    shouldApplyWindowsRendererUnicodeRefresh,
    disposeWindowsModeReset
  }
}
