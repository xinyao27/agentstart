import { RuntimePeer, TerminalClient, runtimeEnvironmentTransport } from '@yiru/protocol'
import {
  TerminalMultiplexClient,
  type TerminalMultiplexConnection
} from '@yiru/protocol/terminal-multiplex'
import { TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES } from '@yiru/protocol/terminal-multiplex/frame'
import { translate } from '~renderer/i18n/i18n'
import type {
  BrowserHostTerminalMultiplexHandle,
  BrowserHostTerminalMultiplexOptions
} from '~renderer/runtime/browser-host-runtime'

import type { ExtensionRuntimeBootstrap } from './session'
import { extensionRuntimeSocketUrl, waitForExtensionRuntimeSocket } from './socket-endpoint'

export async function openExtensionTerminalMultiplex(
  bootstrap: ExtensionRuntimeBootstrap,
  options: BrowserHostTerminalMultiplexOptions
): Promise<BrowserHostTerminalMultiplexHandle> {
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
      throw new Error(translate('terminal.connection.closed', 'Terminal connection closed'))
    }
    socket.send(new Uint8Array(payload))
  }, fail)
  const receive = (event: MessageEvent<unknown>): void => {
    if (!(event.data instanceof ArrayBuffer) || !peer.receive(new Uint8Array(event.data))) {
      fail(
        new Error(
          translate('terminal.multiplex.invalidResponse', 'Invalid terminal multiplex response')
        )
      )
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
    await waitForExtensionRuntimeSocket(socket)
    await peer.hello({
      kind: 'chrome-extension',
      name: 'yiru-extension',
      version: String(bootstrap.protocolVersion),
      instanceId: options.clientInstanceId
    })
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
      throw new Error(
        translate(
          'terminal.multiplex.invalidTicket',
          'Runtime host returned an invalid terminal bulk ticket.'
        )
      )
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
