import type { EmulatorStreamEvent } from '@agentstart/protocol'

import { requireEmulatorClient } from './emulator-target'

type EmulatorFrameStreamHandlers = {
  onError: (message: string) => void
  onFrame: (bytes: Uint8Array<ArrayBufferLike>) => void
}

export function subscribeEmulatorFrameStream(
  input: { streamUrl: string; streamKey?: string },
  handlers: EmulatorFrameStreamHandlers
): () => void {
  const controller = new AbortController()
  void (async () => {
    try {
      const client = await requireEmulatorClient()
      if (controller.signal.aborted) {
        return
      }
      const stream = await client.streamFrames(input, { signal: controller.signal })
      try {
        for await (const event of stream.events) {
          if (controller.signal.aborted) {
            return
          }
          applyEmulatorStreamEvent(event, handlers)
        }
      } finally {
        await stream.cancel('subscriber detached')
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError(error instanceof Error ? error.message : String(error))
      }
    }
  })()
  return () => controller.abort()
}

function applyEmulatorStreamEvent(
  event: EmulatorStreamEvent,
  handlers: EmulatorFrameStreamHandlers
): void {
  switch (event.type) {
    case 'ready':
      break
    case 'frame':
      handlers.onFrame(event.data)
      break
    case 'error':
      handlers.onError(event.message)
      break
  }
}
