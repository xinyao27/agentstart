import { RuntimeProtocolError, StatusCode, type UpdaterSnapshot } from '@agentstart/protocol'

export async function nextRemoteServerUpdaterSnapshot(
  snapshots: AsyncIterator<UpdaterSnapshot>,
  expectedRuntimeId: string,
  accept: (snapshot: UpdaterSnapshot) => boolean,
  onSnapshot: (snapshot: UpdaterSnapshot) => void
): Promise<UpdaterSnapshot> {
  while (true) {
    let next: IteratorResult<UpdaterSnapshot>
    try {
      next = await snapshots.next()
    } catch (error) {
      if (error instanceof RuntimeProtocolError && error.code === StatusCode.DEADLINE_EXCEEDED) {
        throw new Error('remote_update_updater_timeout', { cause: error })
      }
      throw error
    }
    if (next.done) {
      throw new Error('remote_update_updater_stream_closed')
    }
    const snapshot = next.value
    // Why: a saved endpoint can be rebound while an operation is in flight;
    // never carry a download/install across runtime ownership generations.
    if (snapshot.runtimeId !== expectedRuntimeId) {
      throw new Error('remote_update_runtime_changed')
    }
    if (snapshot.status.state === 'error') {
      throw new Error(snapshot.status.message)
    }
    onSnapshot(snapshot)
    if (accept(snapshot)) {
      return snapshot
    }
  }
}
