import type {
  ExtensionRuntimeHostSetup,
  ExtensionRuntimeTerminalHandle,
  ExtensionRuntimeTerminalOptions
} from '@agentstart/client/extension-bootstrap'
import { RuntimePeer, TerminalClient, runtimeEnvironmentTransport } from '@agentstart/protocol'
import {
  TerminalMultiplexClient,
  type TerminalMultiplexConnection
} from '@agentstart/protocol/terminal-multiplex'
import { TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES } from '@agentstart/protocol/terminal-multiplex/frame'

import type { ExtensionBootstrapResult } from '../bootstrap-response'
import { extensionRuntimeSocketUrl, waitForExtensionRuntimeSocket } from './socket-endpoint'

export async function openExtensionTerminalMultiplex(
  bootstrap: ExtensionBootstrapResult,
  setup: ExtensionRuntimeHostSetup,
  options: ExtensionRuntimeTerminalOptions
): Promise<ExtensionRuntimeTerminalHandle> {
  const socket = new WebSocket(extensionRuntimeSocketUrl(bootstrap))
  socket.binaryType = 'arraybuffer'
  let closed = false
  let connection: TerminalMultiplexConnection | undefined
  const close = (): void => {
    if (closed) {
      return
    }
    closed = true
    socket.removeEventListener('message', receive)
    socket.removeEventListener('close', disconnected)
    void connection?.close().catch(() => {})
    peer.close()
    socket.close()
  }
  const fail = (error: unknown): void => {
    if (closed) {
      return
    }
    close()
    options.onError(error instanceof Error ? error : new Error(String(error)))
  }
  const peer = new RuntimePeer(async (payload) => {
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error(setup.messages.connectionClosed)
    }
    socket.send(new Uint8Array(payload))
  }, fail)
  const receive = (event: MessageEvent<unknown>): void => {
    if (!(event.data instanceof ArrayBuffer) || !peer.receive(new Uint8Array(event.data))) {
      fail(new Error(setup.messages.invalidMultiplexResponse))
    }
  }
  const disconnected = (): void => {
    if (closed) {
      return
    }
    close()
    options.onClose()
  }
  socket.addEventListener('message', receive)
  socket.addEventListener('close', disconnected)
  try {
    await waitForExtensionRuntimeSocket(socket, setup.messages)
    const welcome = await peer.hello({
      kind: 'chrome-extension',
      name: 'agentstart-extension',
      version: String(bootstrap.protocolVersion),
      instanceId: options.clientInstanceId
    })
    if (bootstrap.expectedRuntimeId !== null && welcome.runtimeId !== bootstrap.expectedRuntimeId) {
      throw new Error('extension_runtime_identity_mismatch')
    }
    const transport =
      options.environmentIdentity === 'local'
        ? peer
        : runtimeEnvironmentTransport(peer, options.environmentIdentity)
    // Why: issue and redeem on the same authenticated target connection, including routed runtimes.
    const ticket = await new TerminalClient(transport).openMultiplex({
      clientInstanceId: options.clientInstanceId,
      environmentId: options.environmentIdentity
    })
    if (
      !ticket.bulkTicket ||
      ticket.expiresAt <= Date.now() ||
      ticket.maxFrameBytes !== TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES
    ) {
      throw new Error(setup.messages.invalidMultiplexTicket)
    }
    connection = await new TerminalMultiplexClient(transport).open(ticket.bulkTicket)
    const active = connection
    void (async () => {
      try {
        for await (const event of active.events) {
          if (closed) {
            return
          }
          if (event.type === 'ready') {
            options.onReady()
          } else {
            options.onBinary(event.bytes)
          }
        }
        disconnected()
      } catch (error) {
        fail(error)
      }
    })()
    return {
      sendBinary: (bytes) => {
        if (!closed) {
          void active.sendBinary(bytes).catch(fail)
        }
      },
      unsubscribe: close
    }
  } catch (error) {
    close()
    throw error
  }
}
