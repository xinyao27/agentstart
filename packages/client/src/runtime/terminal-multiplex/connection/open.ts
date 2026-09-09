import { openConfiguredBrowserHostTerminalMultiplex } from '~renderer/runtime/browser-host-runtime'

export type RuntimeTerminalMultiplexHandle = {
  unsubscribe: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
}

type OpenTerminalMultiplexOptions = {
  environmentIdentity: string
  onReady: () => void
  onBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
  onError: (error: Error) => void
  onClose: () => void
}

const CLIENT_INSTANCE_ID = createClientInstanceId()

export async function openTerminalMultiplexSubscription(
  options: OpenTerminalMultiplexOptions
): Promise<RuntimeTerminalMultiplexHandle> {
  // Why: the daemon admits a bulk ticket only for the connection principal that
  // presents it, and browser hosts get one principal per connection, so the host
  // dials its bulk connection and issues the ticket there rather than reusing one
  // fetched over the shared control transport.
  return openConfiguredBrowserHostTerminalMultiplex({
    clientInstanceId: CLIENT_INSTANCE_ID,
    environmentIdentity: options.environmentIdentity,
    onBinary: options.onBinary,
    onClose: options.onClose,
    onError: options.onError,
    onReady: options.onReady
  })
}

function createClientInstanceId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}
