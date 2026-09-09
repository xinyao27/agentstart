export class LocallyCancelledCalls {
  private readonly ids = new Set<bigint>()
  private readonly limit: number
  private next = 0
  private readonly storage: bigint[] = []

  constructor(limit: number) {
    this.limit = limit
  }

  contains(callId: bigint): boolean {
    return this.ids.has(callId)
  }

  delete(callId: bigint): boolean {
    return this.ids.delete(callId)
  }

  insert(callId: bigint): void {
    if (this.ids.has(callId)) {
      return
    }
    this.ids.add(callId)
    if (this.storage.length < this.limit) {
      this.storage.push(callId)
      return
    }
    this.ids.delete(this.storage[this.next])
    this.storage[this.next] = callId
    this.next = (this.next + 1) % this.limit
  }
}
