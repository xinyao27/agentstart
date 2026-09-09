import { RuntimePeer } from '@yiru/protocol'

import { ExtensionShellServicesChannel } from './shell-services-channel'

const SIDE_CHANNEL_BUFFER_LIMIT_BYTES = 1024 * 1024

export class ExtensionSocketMultiplexer {
  private isClosed = false
  readonly protocolPeer: RuntimePeer
  private readonly shellServices: ExtensionShellServicesChannel
  private readonly socket: WebSocket

  constructor(socket: WebSocket) {
    this.socket = socket
    this.socket.binaryType = 'arraybuffer'
    this.protocolPeer = new RuntimePeer(
      (payload, signal) => this.sendSideChannel(payload, signal),
      () => this.closeFailedProtocol()
    )
    this.shellServices = new ExtensionShellServicesChannel(this.protocolPeer)
    socket.addEventListener('message', this.handleMessage)
    socket.addEventListener('close', this.handleClose)
    socket.addEventListener('error', this.handleError)
  }

  connectShellServices(): Promise<boolean> {
    return this.shellServices.connect()
  }

  close(): void {
    this.finishClose()
  }

  private finishClose(): void {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    this.socket.removeEventListener('message', this.handleMessage)
    this.socket.removeEventListener('close', this.handleClose)
    this.socket.removeEventListener('error', this.handleError)
    this.shellServices.close()
    this.protocolPeer.close()
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (typeof event.data === 'string') {
      this.socket.close(1003, 'Unsupported daemon message')
      return
    }
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data)
      if (this.protocolPeer.receive(bytes)) {
        return
      }
      this.socket.close(1003, 'Unsupported daemon message')
      return
    }
    this.socket.close(1003, 'Unsupported daemon message')
  }

  private readonly handleClose = (): void => {
    this.finishClose()
  }

  private readonly handleError = (): void => {
    this.protocolPeer.close(new Error('Runtime WebSocket failed'))
  }

  private closeFailedProtocol(): void {
    if (!this.isClosed) {
      this.socket.close(1011, 'Runtime protocol failed')
    }
  }

  private send(payload: string | Uint8Array<ArrayBufferLike>): boolean {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return false
    }
    this.socket.send(typeof payload === 'string' ? payload : copySocketBytes(payload))
    return true
  }

  private async sendSideChannel(
    payload: Uint8Array<ArrayBufferLike>,
    signal?: AbortSignal
  ): Promise<void> {
    while (
      !this.isClosed &&
      this.socket.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount > SIDE_CHANNEL_BUFFER_LIMIT_BYTES
    ) {
      await waitForSocketCapacity(signal)
    }
    if (signal?.aborted) {
      throw signal.reason
    }
    if (!this.send(payload)) {
      throw new Error('Runtime WebSocket is not writable')
    }
  }
}

function waitForSocketCapacity(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(finish, 10)
    signal?.addEventListener('abort', abort, { once: true })
    function abort(): void {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    function finish(): void {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
  })
}

function copySocketBytes(value: ArrayBufferLike | ArrayBufferView<ArrayBufferLike>): ArrayBuffer {
  const source = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  return copy.buffer
}
