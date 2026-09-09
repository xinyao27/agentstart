export type RuntimeCallOptions = Readonly<{
  destination?: RuntimeCallDestination
  signal?: AbortSignal
  timeoutMs?: number
}>

export type RuntimeCallDestination = Readonly<{
  environmentId: string
}>

export type RuntimeCall = Readonly<{
  method: string
  payload: Uint8Array
  options?: RuntimeCallOptions
}>

export type RuntimeStream = Readonly<{
  events: AsyncIterable<Uint8Array>
  cancel: (reason?: string) => Promise<void>
}>

export type RuntimeTransport = Readonly<{
  unary: (call: RuntimeCall) => Promise<Uint8Array>
  subscribe: (call: RuntimeCall) => Promise<RuntimeStream>
}>

export type RuntimeFrameSender = (frame: Uint8Array, signal?: AbortSignal) => Promise<void>

export type RuntimePeerInfo = Readonly<{
  kind: 'chrome-extension' | 'ios-app'
  // Why: only peers with host handlers may own reverse calls; terminal bulk peers have none.
  reverseCalls?: boolean
  name: string
  version: string
  instanceId: string
}>

export type RuntimeDuplex = RuntimeStream &
  Readonly<{
    send: (payload: Uint8Array) => Promise<void>
    end: () => Promise<void>
  }>

export type RuntimeDuplexTransport = RuntimeTransport &
  Readonly<{
    duplex: (call: RuntimeCall) => Promise<RuntimeDuplex>
  }>
