import { createBrowserUuid } from '~renderer/browser/uuid'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

import type { PtyTransport, RuntimePtyTransportOptions } from './pty/transport-types'
import { RemoteRuntimePtyConnection } from './remote-runtime-pty-connection'
import { RemoteRuntimePtyHostSession } from './remote-runtime-pty-host-session'
import { RemoteRuntimePtyIo } from './remote-runtime-pty-io'
import { RemoteRuntimePtyState } from './remote-runtime-pty-state'
import { RemoteRuntimePtySubscription } from './remote-runtime-pty-subscription'

/**
 * PTY transport backing a renderer terminal pane with a terminal on a remote
 * runtime host. State, IO arbitration, subscription, and connection lifecycle
 * remain separate modules behind this stable transport surface.
 */
export function createRuntimePtyTransport(
  runtimeTarget: RuntimeClientTarget,
  options: RuntimePtyTransportOptions = {}
): PtyTransport {
  const state = new RemoteRuntimePtyState(runtimeTarget, options.onPtyExit, options.onPtySpawn)
  // Why: tab/leaf ids identify the mirrored host pane, so paired viewers share
  // them. The UUID keeps one viewer's refresh isolated from peer records.
  const clientId = `desktop:${options.tabId ?? 'tab'}:${options.leafId ?? 'leaf'}:${createBrowserUuid()}`
  const hostSession = new RemoteRuntimePtyHostSession(state, options)
  const io = new RemoteRuntimePtyIo(state, clientId)
  const subscription = new RemoteRuntimePtySubscription(state, hostSession, clientId, options)
  const connection = new RemoteRuntimePtyConnection(
    runtimeTarget,
    options,
    state,
    hostSession,
    io,
    subscription
  )

  return {
    connect: (connectOptions) => connection.connect(connectOptions),
    attach: (attachOptions) => connection.attach(attachOptions),
    disconnect: () => connection.disconnect(),
    detach: () => connection.detach(),
    sendInput: (data) => io.sendInput(data),
    sendInputImmediate: (data) => io.sendInputImmediate(data),
    sendInputAccepted: (data) => io.sendInputAccepted(data),
    claimViewport: (cols, rows) => io.claimViewport(cols, rows),
    resize: (cols, rows, meta) => io.resize(cols, rows, meta?.claim),
    setDeliveryState(delivery) {
      state.setDelivery(delivery)
      const handle = state.handle
      return handle ? (state.getCurrentStream(handle)?.setDeliveryState(delivery) ?? false) : false
    },
    isConnected: () => state.connected,
    getPtyId: () => state.ptyId,
    getConnectionId: () => null,
    getRuntimeEnvironmentId: () =>
      state.target.kind === 'environment' ? state.target.environmentId : null,
    async serializeBuffer(serializeOptions) {
      const handle = state.handle
      if (!state.connected || !handle) {
        return null
      }
      return state.getCurrentStream(handle)?.serializeBuffer(serializeOptions) ?? null
    },
    destroy: () => connection.destroy()
  }
}
