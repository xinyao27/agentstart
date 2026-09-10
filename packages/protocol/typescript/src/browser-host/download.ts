import { create } from '@bufbuild/protobuf'

import { DownloadResponseSchema } from '../../generated/agent_start/runtime/v1/browser_pb.js'
import type {
  DownloadRequest,
  DownloadResponse
} from '../../generated/agent_start/runtime/v1/browser_pb.js'
import type { BrowserCommandExecutor } from './handler.js'

export async function* downloadBrowserFile(
  execute: BrowserCommandExecutor,
  request: DownloadRequest,
  signal: AbortSignal
): AsyncIterable<DownloadResponse> {
  const queue = new DownloadChunkQueue(signal)
  const target = {
    ...(request.target?.page ? { page: request.target.page } : {}),
    ...(request.target?.worktree !== undefined ? { worktree: request.target.worktree } : {})
  }
  const operation: Promise<DownloadOutcome> = execute(
    'browser.download',
    {
      path: request.path,
      receiptId: crypto.randomUUID(),
      selector: request.selector,
      ...target
    },
    null,
    {
      sendBinary: (_receiptId, _sequence, isEnd, payload) =>
        isEnd ? Promise.resolve() : queue.push(payload),
      signal
    }
  ).then(
    (result): DownloadOutcome => {
      try {
        const byteLength = readByteLength(result)
        queue.finish()
        return { byteLength, ok: true }
      } catch (error) {
        queue.fail(error)
        return { error, ok: false }
      }
    },
    (error: unknown): DownloadOutcome => {
      queue.fail(error)
      return { error, ok: false }
    }
  )
  try {
    while (true) {
      const chunk = await queue.receive()
      if (!chunk) {
        break
      }
      yield create(DownloadResponseSchema, { event: { case: 'chunk', value: chunk } })
    }
    const outcome = await operation
    if (!outcome.ok) {
      throw outcome.error
    }
    yield create(DownloadResponseSchema, {
      event: { case: 'byteLength', value: outcome.byteLength }
    })
  } finally {
    queue.cancel()
  }
}

type PendingChunk = {
  bytes: Uint8Array<ArrayBufferLike>
  consumed: () => void
  reject: (reason?: unknown) => void
}

type DownloadOutcome = { byteLength: number; ok: true } | { error: unknown; ok: false }

class DownloadChunkQueue {
  private isFinished = false
  private failure: unknown
  private pending: PendingChunk | undefined
  private wake: (() => void) | undefined
  private readonly signal: AbortSignal

  constructor(signal: AbortSignal) {
    this.signal = signal
    signal.addEventListener('abort', this.cancel, { once: true })
  }

  push(bytes: Uint8Array<ArrayBufferLike>): Promise<void> {
    if (this.isFinished || this.signal.aborted) {
      return Promise.reject(this.failure ?? this.signal.reason)
    }
    if (this.pending) {
      return Promise.reject(new Error('Browser download producer exceeded its buffer'))
    }
    return new Promise((consumed, reject) => {
      this.pending = { bytes, consumed, reject }
      this.wake?.()
      this.wake = undefined
    })
  }

  async receive(): Promise<Uint8Array<ArrayBufferLike> | undefined> {
    while (!this.pending && !this.isFinished) {
      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
    }
    if (this.pending) {
      const pending = this.pending
      this.pending = undefined
      pending.consumed()
      return pending.bytes
    }
    if (this.failure !== undefined) {
      throw this.failure
    }
    return undefined
  }

  finish(): void {
    this.isFinished = true
    this.wake?.()
    this.wake = undefined
  }

  fail(error: unknown): void {
    this.failure = error
    this.finish()
  }

  readonly cancel = (): void => {
    this.isFinished = true
    this.pending?.reject(this.signal.reason)
    this.pending = undefined
    this.wake?.()
    this.wake = undefined
    this.signal.removeEventListener('abort', this.cancel)
  }
}

function readByteLength(value: unknown): number {
  const candidate =
    typeof value === 'object' && value !== null ? Reflect.get(value, 'byteLength') : undefined
  if (
    typeof candidate !== 'number' ||
    !Number.isSafeInteger(candidate) ||
    candidate < 0 ||
    candidate > 0xffff_ffff
  ) {
    throw new Error('Browser download returned an invalid byte length')
  }
  return candidate
}
