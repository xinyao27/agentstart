import type { ExtensionRuntimeHostMessages } from '@agentstart/client/extension-bootstrap'

import type { ExtensionBootstrapResult } from '../bootstrap-response'

export function extensionRuntimeSocketUrl(bootstrap: ExtensionBootstrapResult): URL {
  const url = new URL(bootstrap.endpoint)
  url.searchParams.set('protocolVersion', String(bootstrap.protocolVersion))
  url.searchParams.set('token', bootstrap.authToken)
  return url
}

export async function waitForExtensionRuntimeSocket(
  socket: WebSocket,
  messages: ExtensionRuntimeHostMessages,
  timeoutMs = 12_000
): Promise<void> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('error', handleError)
      timeoutSignal.removeEventListener('abort', handleAbort)
    }
    const handleOpen = (): void => {
      cleanup()
      resolve()
    }
    const handleError = (): void => {
      cleanup()
      reject(new Error(messages.connectionFailed))
    }
    const handleAbort = (): void => {
      cleanup()
      socket.close()
      reject(new Error(messages.connectionTimedOut))
    }
    socket.addEventListener('open', handleOpen, { once: true })
    socket.addEventListener('error', handleError, { once: true })
    timeoutSignal.addEventListener('abort', handleAbort, { once: true })
  })
}
