import { useEffect } from 'react'

import {
  canSkipRuntimeMobileSessionSyncKeyBuild,
  getRuntimeMobileSessionSyncKey,
  runtimeMobileSessionSyncKeysEqual,
  scheduleRuntimeGraphSync,
  setRuntimeGraphStoreStateGetter,
  setRuntimeGraphSyncEnabled
} from '../runtime/sync-runtime-graph'
import { useAppStore } from '../store/state'
import { getSystemPrefersDarkSnapshot } from '../terminal-pane/use-system-prefers-dark'

export function useRuntimeGraphSync(workspaceSessionReady: boolean): void {
  useEffect(() => {
    setRuntimeGraphStoreStateGetter(useAppStore.getState)
    return () => {
      setRuntimeGraphStoreStateGetter(null)
    }
  }, [])

  useEffect(() => {
    let previousKey = getRuntimeMobileSessionSyncKey(useAppStore.getState())
    return useAppStore.subscribe((state, previousState) => {
      const systemPrefersDark = getSystemPrefersDarkSnapshot()
      if (
        canSkipRuntimeMobileSessionSyncKeyBuild(
          state,
          previousState,
          systemPrefersDark,
          previousKey.systemPrefersDark
        )
      ) {
        return
      }
      const nextKey = getRuntimeMobileSessionSyncKey(
        state,
        previousState,
        previousKey,
        systemPrefersDark
      )
      if (runtimeMobileSessionSyncKeysEqual(nextKey, previousKey)) {
        return
      }
      previousKey = nextKey
      scheduleRuntimeGraphSync()
    })
  }, [])

  useEffect(() => {
    const reconcilePublisher = (): void => {
      // Why: every extension page has its own daemon connection. Only the
      // focused page should own the renderer projection across open windows.
      setRuntimeGraphSyncEnabled(
        workspaceSessionReady && document.visibilityState === 'visible' && document.hasFocus()
      )
    }
    reconcilePublisher()
    window.addEventListener('focus', reconcilePublisher)
    window.addEventListener('blur', reconcilePublisher)
    document.addEventListener('visibilitychange', reconcilePublisher)
    return () => {
      window.removeEventListener('focus', reconcilePublisher)
      window.removeEventListener('blur', reconcilePublisher)
      document.removeEventListener('visibilitychange', reconcilePublisher)
      setRuntimeGraphSyncEnabled(false)
    }
  }, [workspaceSessionReady])
}
