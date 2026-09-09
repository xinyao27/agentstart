import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { runtimePtyEnvironmentId, runtimePtyHandle } from '@yiru/protocol/terminal-identity'

import { getActiveRuntimeTarget } from './rpc-client'
import { getRuntimeTerminalMultiplexer } from './terminal-multiplex/registry'
import { openRuntimeTerminalClient } from './terminal-protocol'
import { publishRendererTerminalSideEffects } from './terminal-side-effect-client'

const LIVE_TAIL_SUBSCRIPTION_TIMEOUT_MS = 10_000

export function runtimeTerminalErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function subscribeToRuntimeTerminalData(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string,
  clientId: string,
  watcher: (data: string) => void,
  options?: {
    startAtLiveTail?: boolean
    delivery?: {
      visible: boolean
      interested: boolean
      priority: 'parked' | 'visible' | 'active'
    }
  }
): Promise<() => void> {
  const terminal = runtimePtyHandle(ptyId)
  const ownerEnvironmentId = runtimePtyEnvironmentId(ptyId)
  const target = ownerEnvironmentId
    ? ({ kind: 'environment', environmentId: ownerEnvironmentId } as const)
    : getActiveRuntimeTarget(settings)
  if (!terminal) {
    return () => {}
  }

  let resolveLiveTail: (() => void) | null = null
  let rejectLiveTail: ((error: Error) => void) | null = null
  const liveTailReady = options?.startAtLiveTail
    ? new Promise<void>((resolve, reject) => {
        resolveLiveTail = resolve
        rejectLiveTail = reject
      })
    : null
  const rejectPendingLiveTail = (message: string): void => {
    rejectLiveTail?.(new Error(message))
    resolveLiveTail = null
    rejectLiveTail = null
  }

  const stream = await getRuntimeTerminalMultiplexer(target).subscribeTerminal({
    terminal,
    client: { id: clientId, type: 'desktop' },
    callbacks: {
      onData: (data, _meta, onParsed) => {
        watcher(data)
        onParsed()
      },
      onSnapshot: (data, _meta, onParsed) => {
        if (!options?.startAtLiveTail) {
          watcher(data)
        }
        onParsed()
      },
      onSideEffectBatch: (batch, meta) => {
        publishRendererTerminalSideEffects({
          ptyId,
          seq: meta.seq,
          epoch: meta.epoch,
          facts: batch.facts,
          replay: batch.replay
        })
      },
      onSubscribed: () => {
        resolveLiveTail?.()
        resolveLiveTail = null
        rejectLiveTail = null
      },
      onEnd: () => rejectPendingLiveTail('Remote terminal ended before live output was ready.'),
      onError: (message) => rejectPendingLiveTail(message),
      onTransportClose: () =>
        rejectPendingLiveTail('Remote terminal closed before live output was ready.')
    }
  })
  if (options?.delivery) {
    stream.setDeliveryState(options.delivery)
  }

  if (liveTailReady) {
    let timeout: ReturnType<typeof setTimeout> | null = setTimeout(
      () => rejectPendingLiveTail('Timed out waiting for remote terminal live output.'),
      LIVE_TAIL_SUBSCRIPTION_TIMEOUT_MS
    )
    try {
      // Why: outcome observers must ignore historical snapshots and be armed
      // before the command whose output they classify, including over SSH.
      await liveTailReady
    } catch (error) {
      stream.close()
      throw error
    } finally {
      if (timeout !== null) {
        clearTimeout(timeout)
        timeout = null
      }
    }
  }

  return () => stream.close()
}

export function subscribeToRuntimeTerminalExit(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string,
  onExit: (code: number) => void
): () => void {
  const terminal = runtimePtyHandle(ptyId)
  if (!terminal) {
    return () => {}
  }
  const environmentId = runtimePtyEnvironmentId(ptyId)
  const target = environmentId
    ? ({ kind: 'environment', environmentId } as const)
    : getActiveRuntimeTarget(settings)
  const controller = new AbortController()
  void openRuntimeTerminalClient(target)
    .then((client) =>
      client.wait(
        { terminal, for: 'exit' },
        { signal: controller.signal, timeoutMs: 24 * 60 * 60 * 1_000 }
      )
    )
    .then((result) => {
      if (!controller.signal.aborted) {
        onExit(result.wait.exitCode ?? 0)
      }
    })
    .catch(() => {})
  return () => controller.abort()
}
