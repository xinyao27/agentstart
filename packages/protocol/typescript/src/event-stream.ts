import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeStream } from './transport.js'

type WaitingConsumer = Readonly<{
  resolve: (result: IteratorResult<Uint8Array>) => void
  reject: (reason?: unknown) => void
}>

const MAX_BUFFERED_BYTES = 1024 * 1024
const MAX_BUFFERED_EVENTS = 1024
const MAX_WAITING_CONSUMERS = 128

class StreamQueue<Value> {
  private head = 0
  private values: Value[] = []

  get size(): number {
    return this.values.length - this.head
  }

  clear(): void {
    this.head = 0
    this.values = []
  }

  push(value: Value): void {
    this.values.push(value)
  }

  shift(): Value | undefined {
    const value = this.values[this.head]
    if (value === undefined) {
      return undefined
    }
    this.head += 1
    if (this.head >= 64 && this.head * 2 >= this.values.length) {
      this.values = this.values.slice(this.head)
      this.head = 0
    }
    return value
  }

  takeAll(): Value[] {
    const values = this.values.slice(this.head)
    this.clear()
    return values
  }
}

export class RuntimeEventStream implements AsyncIterableIterator<Uint8Array> {
  private readonly buffered = new StreamQueue<Uint8Array>()
  private bufferedBytes = 0
  private failure: unknown
  private isEnded = false
  private readonly onCancel: (reason?: string) => Promise<void>
  private readonly onConsumed: (byteLength: number) => void
  private readonly waiting = new StreamQueue<WaitingConsumer>()

  constructor(
    onCancel: (reason?: string) => Promise<void>,
    onConsumed: (byteLength: number) => void
  ) {
    this.onCancel = onCancel
    this.onConsumed = onConsumed
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    return this
  }

  next(): Promise<IteratorResult<Uint8Array>> {
    const value = this.buffered.shift()
    if (value) {
      this.bufferedBytes -= value.byteLength
      this.onConsumed(value.byteLength)
      return Promise.resolve({ done: false, value })
    }
    if (this.failure !== undefined) {
      return Promise.reject(this.failure)
    }
    if (this.isEnded) {
      return Promise.resolve({ done: true, value: undefined })
    }
    if (this.waiting.size >= MAX_WAITING_CONSUMERS) {
      return Promise.reject(
        new RuntimeProtocolError(StatusCode.RESOURCE_EXHAUSTED, 'Too many pending stream reads')
      )
    }
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }))
  }

  async return(): Promise<IteratorResult<Uint8Array>> {
    const shouldCancel = !this.isEnded
    this.isEnded = true
    const discardedBytes = this.bufferedBytes
    this.buffered.clear()
    this.bufferedBytes = 0
    if (discardedBytes > 0) {
      this.onConsumed(discardedBytes)
    }
    for (const consumer of this.waiting.takeAll()) {
      consumer.resolve({ done: true, value: undefined })
    }
    if (shouldCancel) {
      await this.onCancel('Runtime stream consumer stopped')
    }
    return { done: true, value: undefined }
  }

  push(value: Uint8Array): boolean {
    if (this.isEnded) {
      return false
    }
    const consumer = this.waiting.shift()
    if (consumer) {
      this.onConsumed(value.byteLength)
      consumer.resolve({ done: false, value })
      return true
    }
    if (
      this.buffered.size >= MAX_BUFFERED_EVENTS ||
      this.bufferedBytes + value.byteLength > MAX_BUFFERED_BYTES
    ) {
      return false
    }
    this.buffered.push(value)
    this.bufferedBytes += value.byteLength
    return true
  }

  end(): void {
    this.isEnded = true
    for (const consumer of this.waiting.takeAll()) {
      consumer.resolve({ done: true, value: undefined })
    }
  }

  fail(error: unknown): void {
    this.failure = error
    this.isEnded = true
    this.buffered.clear()
    this.bufferedBytes = 0
    for (const consumer of this.waiting.takeAll()) {
      consumer.reject(error)
    }
  }

  asRuntimeStream(): RuntimeStream {
    return {
      events: this,
      cancel: this.onCancel
    }
  }
}
