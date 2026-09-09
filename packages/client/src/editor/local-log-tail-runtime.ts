import type { LogTailReadResult, LogTailWatchMessage } from '@yiru/protocol'
import { requireFilesTarget } from '~renderer/runtime/files-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

export type RuntimeLogTailReadResult = LogTailReadResult

export type RuntimeLogTailWatch = {
  /** Resolves once the watch is installed, or rejects if setup failed. */
  ready: Promise<void>
  /** Tears down the stream. Safe to call before or after `ready` settles. */
  stop: () => void
}

export async function readRuntimeLogTailRange(
  target: RuntimeClientTarget,
  args: { filePath: string; fromByteOffset: number; expectedIdentity?: string }
): Promise<RuntimeLogTailReadResult> {
  const client = await requireFilesTarget(target)
  return client.readLogTail(args, { timeoutMs: 15_000 })
}

/**
 * Opens a dedicated `files.watchLogTail` stream for one live-tail session.
 * Unlike `files.watch` (shared across Explorer/Source Control consumers of the
 * same worktree), each editor tab tails its own file, so this owns one
 * connection per call rather than fanning out through a shared registry.
 */
export function watchRuntimeLogTail(
  target: RuntimeClientTarget,
  filePath: string,
  // Why: a protobuf watch is a native stream the caller cancels directly, so this no
  // longer travels to the server — kept so callers can still label their own session.
  _subscriptionId: string,
  onChanged: (eventType: 'change' | 'rename') => void
): RuntimeLogTailWatch {
  const abort = new AbortController()
  // Why: an object holder (rather than reassigned bare `let`s) so the
  // resolve/reject captured by the async IIFE below keep the declared
  // function type instead of narrowing through control flow.
  const deferred: { resolve: () => void; reject: (error: unknown) => void } = {
    resolve: () => {},
    reject: () => {}
  }
  const ready = new Promise<void>((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })

  void (async (): Promise<void> => {
    let cancel: (() => Promise<void>) | null = null
    try {
      const client = await requireFilesTarget(target)
      const watch = await client.watchLogTail(filePath, { signal: abort.signal })
      cancel = watch.cancel
      for await (const event of watch.messages as AsyncIterable<LogTailWatchMessage>) {
        if (event.type === 'ready') {
          deferred.resolve()
        } else if (event.type === 'changed') {
          onChanged(event.eventType)
        } else if (event.type === 'end') {
          break
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        deferred.reject(error)
      }
    } finally {
      await cancel?.()
    }
  })()

  return {
    ready,
    stop: () => abort.abort()
  }
}
