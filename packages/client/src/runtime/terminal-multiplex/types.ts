export type RemoteRuntimeTerminalDriver =
  | { kind: 'idle' }
  | { kind: 'desktop' }
  | { kind: 'mobile'; clientId: string }

export type RemoteRuntimeTerminalError = {
  kind: 'protocol'
  retryable: boolean
}

export type RemoteRuntimeMultiplexedTerminalCallbacks = {
  onData: (
    data: string,
    meta: { seq?: number; rawLength: number; wireByteLength: number },
    onParsed: () => void
  ) => void
  onSnapshot: (
    data: string,
    meta: {
      cols: number
      rows: number
      wireByteLength: number
      pendingEscapeTailAnsi?: string
    },
    onParsed: () => void
  ) => void
  onSubscribed?: () => void
  onEnd?: () => void
  onError?: (message: string, error?: RemoteRuntimeTerminalError) => void
  onFitOverrideChanged?: (event: {
    mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
    cols: number
    rows: number
  }) => void
  onDriverChanged?: (driver: RemoteRuntimeTerminalDriver) => void
  onSideEffectBatch?: (
    batch: TerminalMultiplexSideEffectBatch,
    meta: { seq: bigint; epoch: bigint }
  ) => void
  onMetadata?: (metadata: Record<string, unknown>) => void
  onClearBuffer?: () => void
  onTransportClose?: () => void
}

export type RemoteRuntimeMultiplexedTerminal = {
  streamId: number
  sendInput: (text: string) => boolean
  sendInputAccepted: (text: string) => Promise<boolean>
  sendQueryReply: (text: string) => boolean
  resize: (cols: number, rows: number) => boolean
  claimViewport: (cols: number, rows: number) => boolean
  setDeliveryState: (state: {
    visible: boolean
    interested: boolean
    priority: 'parked' | 'visible' | 'active'
  }) => boolean
  signal: (signal: string) => boolean
  kill: (keepHistory: boolean) => boolean
  serializeBuffer: (opts?: { scrollbackRows?: number }) => Promise<{
    data: string
    cols: number
    rows: number
    seq?: number
    source?: 'headless' | 'provider'
  } | null>
  close: () => void
}

export const REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE =
  'Remote terminal snapshot exceeded the 2 MiB replay limit; live output will continue.'
import type { TerminalMultiplexSideEffectBatch } from '@yiru/protocol/terminal-multiplex/side-effects'
