import { normalizeTerminalTitle } from '~renderer/agent/title/status'

import type { RemoteRuntimeMultiplexedTerminalCallbacks } from '../types'
import type { RemoteTerminalSnapshot } from './snapshot'

export function publishRemoteTerminalSnapshot(
  snapshot: RemoteTerminalSnapshot,
  callbacks: RemoteRuntimeMultiplexedTerminalCallbacks,
  onParsed: () => void
): void {
  if (snapshot.lastTitle !== null) {
    callbacks.onSideEffectBatch?.(
      {
        facts: [
          {
            kind: 'title',
            normalizedTitle: normalizeTerminalTitle(snapshot.lastTitle),
            rawTitle: snapshot.lastTitle
          }
        ],
        replay: true
      },
      { seq: snapshot.coverageEndSeq, epoch: snapshot.epoch }
    )
  }
  callbacks.onSnapshot(
    snapshot.data,
    {
      cols: snapshot.cols,
      rows: snapshot.rows,
      wireByteLength: snapshot.wireByteLength,
      ...(snapshot.pendingEscapeTailAnsi
        ? { pendingEscapeTailAnsi: snapshot.pendingEscapeTailAnsi }
        : {})
    },
    onParsed
  )
}
