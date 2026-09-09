type RuntimeStreamFanOutOptions<TClient, TEvent> = {
  resolveClient: () => Promise<TClient>
  open: (client: TClient, signal: AbortSignal) => Promise<AsyncIterable<TEvent>>
  releaseClient?: (client: TClient) => void
  retryDelayMs?: (attempt: number) => number
  onConnectionStateChange?: (state: RuntimeStreamConnectionState) => void
}

export type RuntimeStreamConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

export type RuntimeStreamFanOut<TEvent> = {
  subscribe: (listener: (event: TEvent) => void) => () => void
}

// Why: One upstream iterator serves multiple feature callbacks without multiplying server subscriptions.
export function createRuntimeStreamFanOut<TClient, TEvent>(
  options: RuntimeStreamFanOutOptions<TClient, TEvent>
): RuntimeStreamFanOut<TEvent> {
  const listeners = new Set<(event: TEvent) => void>()
  let stopUpstream: (() => void) | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let retryAttempt = 0

  const setConnectionState = (state: RuntimeStreamConnectionState): void => {
    options.onConnectionStateChange?.(state)
  }

  const openUpstream = (): void => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    const currentGeneration = ++generation
    const controller = new AbortController()
    stopUpstream = () => controller.abort()
    setConnectionState('connecting')
    void (async () => {
      let client: TClient | null = null
      try {
        client = await options.resolveClient()
        if (controller.signal.aborted) {
          return
        }
        const stream = await options.open(client, controller.signal)
        setConnectionState('connected')
        for await (const event of stream) {
          if (controller.signal.aborted) {
            return
          }
          retryAttempt = 0
          for (const listener of Array.from(listeners)) {
            try {
              listener(event)
            } catch (error) {
              console.error('[runtime] stream listener failed', error)
            }
          }
        }
      } catch {
        // Why: host streams are advisory invalidations. A dropped iterator
        // must not become an unhandled rejection during renderer teardown.
      } finally {
        if (client !== null) {
          options.releaseClient?.(client)
        }
        if (generation === currentGeneration) {
          stopUpstream = null
          if (listeners.size > 0 && !controller.signal.aborted) {
            setConnectionState('disconnected')
            retryAttempt++
            retryTimer = setTimeout(openUpstream, options.retryDelayMs?.(retryAttempt) ?? 1_000)
          } else {
            setConnectionState('idle')
          }
        }
      }
    })()
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      if (listeners.size === 1) {
        openUpstream()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          generation++
          stopUpstream?.()
          stopUpstream = null
          if (retryTimer) {
            clearTimeout(retryTimer)
            retryTimer = null
          }
          retryAttempt = 0
          setConnectionState('idle')
        }
      }
    }
  }
}
