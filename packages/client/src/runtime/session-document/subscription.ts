import type { ShellSessionClient, ShellSessionSnapshot } from '@yiru/protocol'

export function subscribeSessionDocument(
  openClient: () => Promise<ShellSessionClient>,
  hostId: string | undefined,
  receive: (snapshot: ShellSessionSnapshot, signal: AbortSignal) => Promise<void>
): () => void {
  const controller = new AbortController()
  let retry: ReturnType<typeof setTimeout> | undefined
  const run = async (): Promise<void> => {
    let cancel: (() => Promise<void>) | undefined
    try {
      const client = await openClient()
      if (controller.signal.aborted) {
        return
      }
      const stream = await client.watch(hostId, { signal: controller.signal })
      cancel = stream.cancel
      for await (const snapshot of stream.events) {
        if (controller.signal.aborted) {
          return
        }
        await receive(snapshot, controller.signal)
      }
    } catch {
      // Why: reconnect starts with a full versioned snapshot; pending local edits stay in the writer.
    } finally {
      await cancel?.().catch(() => {})
      if (!controller.signal.aborted) {
        retry = setTimeout(() => {
          void run()
        }, 1000)
      }
    }
  }
  void run()
  return () => {
    controller.abort()
    if (retry !== undefined) {
      clearTimeout(retry)
    }
  }
}
