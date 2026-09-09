import { useEffect } from 'react'
import { receiveSessionProjection } from '~renderer/runtime/session-document/projection'
import { flushPendingSessionWrites } from '~renderer/runtime/session-document/projection-scope'

import { shouldPersistWorkspaceSession } from '../editor/workspace-session'
import { patchWorkspaceSessionByHost } from '../editor/workspace-session-host-persistence'
import { shellClient } from '../runtime/shell-client'
import { shutdownBufferCaptures } from '../runtime/terminal-shutdown-buffer-captures'
import { useAppStore } from '../store/state'
import { registerUpdaterBeforeUnloadBypass } from '../updates/before-unload'
import { createSessionWriteSubscriber } from './session-write-subscriber'

export function useSessionPersistence(): void {
  const workspaceSessionReady = useAppStore(
    (state) => state.workspaceSessionReady && state.hydrationSucceeded
  )
  useEffect(() => registerUpdaterBeforeUnloadBypass(), [])
  useEffect(
    () =>
      workspaceSessionReady ? shellClient.session.subscribe(receiveSessionProjection) : undefined,
    [workspaceSessionReady]
  )

  useEffect(() => {
    return createSessionWriteSubscriber({
      store: useAppStore,
      persist: ({ patch }) => {
        const state = useAppStore.getState()
        void patchWorkspaceSessionByHost(shellClient.session, patch, state).catch(() => {})
      }
    })
  }, [])

  useEffect(() => {
    // Why: manual quit can emit beforeunload twice after terminal panes have
    // unmounted; only the first pass still owns the useful scrollback snapshot.
    let hasCapturedShutdownBuffers = false
    const captureAndFlush = (): void => {
      if (hasCapturedShutdownBuffers || !shouldPersistWorkspaceSession(useAppStore.getState())) {
        return
      }
      for (const capture of shutdownBufferCaptures.values()) {
        try {
          capture({ includeLocalBuffers: false })
        } catch {
          // Why: one failed pane must not prevent the remaining buffers from persisting.
        }
      }
      flushPendingSessionWrites()
      void shellClient.session.flush().catch(() => {})
      hasCapturedShutdownBuffers = true
    }
    window.addEventListener('beforeunload', captureAndFlush)
    return () => window.removeEventListener('beforeunload', captureAndFlush)
  }, [])
}
