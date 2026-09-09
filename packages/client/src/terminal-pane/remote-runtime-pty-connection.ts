import { encodeRuntimePtyId, parseRuntimePtyId } from '@yiru/protocol/terminal-identity'
import { translate } from '~renderer/i18n/i18n'
import { isRemoteTerminalSurfaceTabId } from '~renderer/runtime/remote-terminal-surface-id'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'
import { runtimeTerminalErrorMessage } from '~renderer/runtime/terminal-stream'
import { toRuntimeTerminalWorktreeSelector } from '~renderer/runtime/worktree-selector'
import { useAppStore } from '~renderer/store/state'

import type {
  PtyConnectResult,
  PtyTransport,
  RuntimePtyTransportOptions
} from './pty/transport-types'
import type { RemoteRuntimePtyHostSession } from './remote-runtime-pty-host-session'
import type { RemoteRuntimePtyIo } from './remote-runtime-pty-io'
import type { RemoteRuntimePtyState } from './remote-runtime-pty-state'
import type { RemoteRuntimePtySubscription } from './remote-runtime-pty-subscription'
import { retryRuntimeUnavailable } from './runtime-unavailable-retry'

export class RemoteRuntimePtyConnection {
  private readonly runtimeTarget: RuntimeClientTarget
  private readonly options: RuntimePtyTransportOptions
  private readonly state: RemoteRuntimePtyState
  private readonly hostSession: RemoteRuntimePtyHostSession
  private readonly io: RemoteRuntimePtyIo
  private readonly subscription: RemoteRuntimePtySubscription

  constructor(
    runtimeTarget: RuntimeClientTarget,
    options: RuntimePtyTransportOptions,
    state: RemoteRuntimePtyState,
    hostSession: RemoteRuntimePtyHostSession,
    io: RemoteRuntimePtyIo,
    subscription: RemoteRuntimePtySubscription
  ) {
    this.runtimeTarget = runtimeTarget
    this.options = options
    this.state = state
    this.hostSession = hostSession
    this.io = io
    this.subscription = subscription
  }

  async connect(options: Parameters<PtyTransport['connect']>[0]): Promise<PtyConnectResult | void> {
    this.state.setCallbacks(options.callbacks)
    if (this.state.destroyed || !this.options.worktreeId) {
      return
    }
    try {
      if (isRemoteTerminalSurfaceTabId(this.options.tabId ?? '')) {
        return await this.attachHostSessionMirror(options)
      }
      return await this.createTerminal(options)
    } catch (error) {
      this.state.callbacks.onError?.(runtimeTerminalErrorMessage(error))
      return undefined
    }
  }

  attach(options: Parameters<PtyTransport['attach']>[0]): void {
    this.state.setCallbacks(options.callbacks)
    const restoredTerminal = parseRuntimePtyId(options.existingPtyId)
    if (this.state.handle && this.state.handle !== restoredTerminal?.handle) {
      // Why: debounced input is scoped by the current terminal handle at flush time.
      this.io.clearInput()
    }
    if (!restoredTerminal) {
      this.state.clearInvalidHandle()
      this.state.callbacks.onError?.(
        translate(
          'auto.components.terminal.pane.remoteRuntimePtyTransport.invalidId',
          'Remote runtime terminal id is invalid.'
        )
      )
      return
    }
    const target = restoredTerminal.environmentId
      ? { kind: 'environment' as const, environmentId: restoredTerminal.environmentId }
      : this.runtimeTarget
    this.state.restoreHandle(restoredTerminal.handle, options.existingPtyId, target, {
      cols: options.cols ?? 80,
      rows: options.rows ?? 24
    })
    const targetHandle = this.state.handle
    const targetPtyId = this.state.ptyId
    void this.subscription.subscribe().catch((error) => {
      if (!targetHandle || !this.state.isCurrent(targetHandle, targetPtyId)) {
        return
      }
      if (!this.state.getCurrentStream(targetHandle)) {
        this.state.closeStream()
      }
      this.state.clearViewportClaim()
      this.state.handleRemoteError(error)
    })
  }

  disconnect(): void {
    this.io.flushAndClear()
    this.subscription.clearOutputState()
    this.state.disconnect(true)
  }

  detach(): void {
    this.io.flushAndClear()
    this.subscription.clearOutputState()
    this.state.detach()
  }

  destroy(): void {
    this.state.destroy()
    this.disconnect()
    this.io.clear()
  }

  private async attachHostSessionMirror(
    options: Parameters<PtyTransport['connect']>[0]
  ): Promise<PtyConnectResult | undefined> {
    const tabId = this.options.tabId
    if (!tabId) {
      return undefined
    }
    const hostHandle = await this.hostSession.waitForHandle(tabId)
    if (!hostHandle || this.state.destroyed) {
      if (!this.state.destroyed) {
        this.state.handleRemoteError(new Error('terminal_gone'))
      }
      return undefined
    }
    const ptyId = encodeRuntimePtyId(hostHandle, environmentIdForTarget(this.state.target))
    this.state.markConnected(hostHandle, ptyId, {
      cols: options.cols ?? 80,
      rows: options.rows ?? 24
    })
    await this.subscription.subscribe()
    if (this.state.destroyed || !this.state.connected || !this.state.ptyId) {
      return undefined
    }
    return { id: this.state.ptyId, replay: '' } satisfies PtyConnectResult
  }

  private async createTerminal(
    connectOptions: Parameters<PtyTransport['connect']>[0]
  ): Promise<PtyConnectResult | undefined> {
    const worktreeId = this.options.worktreeId
    if (!worktreeId) {
      return undefined
    }
    const created = await retryRuntimeUnavailable(
      async () =>
        (await openRuntimeTerminalClient(this.state.target)).create({
          worktree: toRuntimeTerminalWorktreeSelector(worktreeId),
          viewport: { cols: connectOptions.cols ?? 80, rows: connectOptions.rows ?? 24 },
          ...this.createOptions(connectOptions),
          tabId: this.options.tabId,
          leafId: this.options.leafId,
          focus: false,
          // Why: the renderer pane already exists; activation is local state,
          // not permission for the remote runtime to reveal UI.
          presentation: 'background',
          ...(this.options.activate === true ? { activate: true } : {})
        }),
      () => this.state.destroyed
    )
    const terminal = created.terminal
    const environmentId = environmentIdForTarget(this.state.target)
    if (terminal.ptyId) {
      useAppStore
        .getState()
        .rememberTerminalSessionId(terminal.handle, terminal.ptyId, environmentId)
    }
    if (this.state.destroyed) {
      await this.closeRemoteTerminal(terminal.handle)
      return undefined
    }
    const ptyId = encodeRuntimePtyId(terminal.handle, environmentId)
    this.state.markConnected(terminal.handle, ptyId, {
      cols: connectOptions.cols ?? 80,
      rows: connectOptions.rows ?? 24
    })
    await this.subscription.subscribe()
    if (this.state.destroyed || !this.state.connected || !this.state.ptyId) {
      return undefined
    }
    return {
      id: this.state.ptyId,
      replay: '',
      ...(terminal.restore.startupCwdFallback
        ? { startupCwdFallback: terminal.restore.startupCwdFallback }
        : {})
    } satisfies PtyConnectResult
  }

  private createOptions(connectOptions: Parameters<PtyTransport['connect']>[0]): object {
    const command = connectOptions.command ?? this.options.command
    const startupCommandDelivery =
      connectOptions.startupCommandDelivery ?? this.options.startupCommandDelivery
    const env = connectOptions.env ?? this.options.env
    const envToDelete = connectOptions.envToDelete ?? this.options.envToDelete
    const launchConfig = connectOptions.launchConfig ?? this.options.launchConfig
    const launchToken = connectOptions.launchToken ?? this.options.launchToken
    const launchAgent = connectOptions.launchAgent ?? this.options.launchAgent
    return {
      ...(command !== undefined ? { command } : {}),
      ...(this.options.cwd !== undefined ? { cwd: this.options.cwd } : {}),
      ...(this.options.cwdFallback !== undefined ? { cwdFallback: this.options.cwdFallback } : {}),
      ...(startupCommandDelivery !== undefined ? { startupCommandDelivery } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(envToDelete !== undefined ? { envToDelete } : {}),
      ...(launchConfig !== undefined ? { launchConfig } : {}),
      ...(launchToken !== undefined ? { launchToken } : {}),
      ...(launchAgent !== undefined ? { launchAgent } : {})
    }
  }

  private async closeRemoteTerminal(handle: string): Promise<void> {
    try {
      await (await openRuntimeTerminalClient(this.state.target)).close(handle)
    } catch {
      // Best-effort parity with local disconnect/kill.
    }
  }
}

function environmentIdForTarget(target: RuntimeClientTarget): string | null {
  return target.kind === 'environment' ? target.environmentId : null
}
