import { useEffect, useRef, useState } from 'react'
import {
  consumePrelaunchedSimulatorSession,
  isManualSimulatorLaunchPending
} from '~renderer/emulator-pane/simulator-launch-coordination'
import { shutdownManagedSimulatorIfNoPane } from '~renderer/emulator-pane/simulator-pane-shutdown-scheduler'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { requireEmulatorClient } from '~renderer/runtime/emulator-target'
import { useAppStore } from '~renderer/store/state'

import { resolveEmulatorAttachTarget } from './emulator-attach-target'
import { markSimulatorDeviceBooted, markSimulatorDeviceShutdown } from './emulator-device-state'
import { buildPrelaunchedEmulatorSessionState } from './emulator-prelaunched-session'
import { emulatorPaneErrorMessage } from './error-message'
import { buildEmulatorPaneSessionView } from './session-view'
import {
  deviceLabel,
  simulatorPreviewStreamUrl,
  type EmulatorPaneSession,
  type SimulatorDeviceRow
} from './types'
import { useEmulatorPaneControls } from './use-emulator-pane-controls'
import { useEmulatorPaneLifecycle } from './use-emulator-pane-lifecycle'
import { useEmulatorPaneManualLaunchEvents } from './use-emulator-pane-manual-launch-events'
import { useEmulatorPaneSessionEvents } from './use-emulator-pane-session-events'
import { useEmulatorPaneShutdown } from './use-emulator-pane-shutdown'

type UseEmulatorPaneSessionArgs = {
  worktreeId: string
  tabId?: string
  autoAttachOnMount: boolean
}

export function useEmulatorPaneSession({
  worktreeId,
  tabId,
  autoAttachOnMount
}: UseEmulatorPaneSessionArgs) {
  const [devices, setDevices] = useState<SimulatorDeviceRow[]>([])
  const configuredDefaultUdid = useAppStore(
    (state) => state.settings?.mobileEmulatorDefaultDeviceUdid ?? null
  )
  const [prelaunchedSession] = useState<EmulatorPaneSession['info'] | null>(() =>
    consumePrelaunchedSimulatorSession(worktreeId)
  )
  const prelaunchedState = buildPrelaunchedEmulatorSessionState(
    prelaunchedSession,
    configuredDefaultUdid
  )
  const [selectedUdid, setSelectedUdid] = useState<string | null>(prelaunchedState.selectedUdid)
  const [session, setSession] = useState<EmulatorPaneSession | null>(prelaunchedState.session)
  const [loading, setLoading] = useState(
    !prelaunchedState.session && isManualSimulatorLaunchPending(worktreeId)
  )
  const [error, setError] = useState<string | null>(null)
  const [streamKey, setStreamKey] = useState<string | null>(prelaunchedState.streamKey)
  const mountedRef = useRef(true)
  const liveTargetRef = useRef<string | null>(prelaunchedState.liveTarget)
  const deviceRefreshErrorRef = useRef<unknown>(null)
  const suppressAutoAttachRef = useRef(false)
  const refreshStreamKey = () => setStreamKey(String(Date.now()))
  const {
    sendTap,
    sendButton,
    sendGesture,
    sendRotate,
    visualOrientation,
    resetVisualOrientation
  } = useEmulatorPaneControls(worktreeId, refreshStreamKey)

  const refreshDevices = async (bootedTarget?: string | null) => {
    try {
      const client = await requireEmulatorClient()
      const list = await client.listSimulators()
      const next = markSimulatorDeviceBooted(list, bootedTarget)
      if (!mountedRef.current) {
        return next
      }
      const hadRefreshError = deviceRefreshErrorRef.current !== null
      deviceRefreshErrorRef.current = null
      setDevices(next)
      if (hadRefreshError) {
        setError(null)
      }
      return next
    } catch (error) {
      deviceRefreshErrorRef.current = error
      if (mountedRef.current) {
        setDevices([])
        setError(emulatorPaneErrorMessage(error, 'Could not list emulator devices.'))
      }
      return []
    }
  }

  const applySession = (
    info: EmulatorPaneSession['info'],
    attached = true,
    deviceRows = devices
  ) => {
    if (!mountedRef.current) {
      return
    }
    const target = info?.deviceUdid || info?.device
    const rows = attached ? markSimulatorDeviceBooted(deviceRows, target) : deviceRows
    if (attached && rows !== deviceRows) {
      setDevices(rows)
    }
    if (attached && target && target !== liveTargetRef.current) {
      resetVisualOrientation()
    }
    const row = rows.find((d) => d.udid === target || d.name === target)
    const displayName = row?.name || deviceLabel(info)
    const enriched = { ...info, displayName, state: attached ? 'Booted' : info?.state }
    setSession({ attached, info: enriched })
    liveTargetRef.current = attached ? target || null : null
    setLoading(false)
    if (attached) {
      suppressAutoAttachRef.current = false
    }
    setError(null)
    if (attached && simulatorPreviewStreamUrl(enriched)) {
      setStreamKey(String(Date.now()))
    }
    if (info?.deviceUdid || info?.device) {
      setSelectedUdid(info.deviceUdid || info.device || null)
    }
    if (tabId) {
      useAppStore.getState().setTabLabel(tabId, displayName)
    }
  }

  const clearSessionAfterShutdown = (deviceTarget?: string | null) => {
    if (!mountedRef.current) {
      return
    }
    const target =
      deviceTarget || session?.info?.deviceUdid || session?.info?.device || selectedUdid
    setDevices((current) => markSimulatorDeviceShutdown(current, target))
    setSession(null)
    liveTargetRef.current = null
    suppressAutoAttachRef.current = true
    setStreamKey(null)
    resetVisualOrientation()
    setError(null)
    if (tabId) {
      const row = devices.find((device) => device.udid === target || device.name === target)
      useAppStore.getState().setTabLabel(tabId, row?.name || 'Mobile Emulator')
    }
  }

  const attach = useEventCallback(async (deviceTarget?: string) => {
    if (loading) {
      return
    }
    suppressAutoAttachRef.current = false
    setLoading(true)
    setError(null)
    if (tabId) {
      useAppStore.getState().setTabLabel(tabId, 'Starting…')
    }
    let requestedTarget: string | undefined
    try {
      let list = devices
      if (list.length === 0) {
        list = (await refreshDevices()) ?? []
      }
      if (list.length === 0 && deviceRefreshErrorRef.current) {
        throw deviceRefreshErrorRef.current
      }
      const target = resolveEmulatorAttachTarget({
        configuredDefaultUdid,
        devices: list,
        deviceTarget,
        selectedUdid
      })
      if (!target) {
        throw new Error('No iOS Simulator devices found. Add one in Xcode Settings > Platforms.')
      }
      requestedTarget = target
      setSelectedUdid(target)
      if (target !== liveTargetRef.current) {
        // Why: switching devices should show an explicit connecting state,
        // not a frozen frame from the previously attached emulator.
        setSession(null)
        setStreamKey(null)
        liveTargetRef.current = null
        resetVisualOrientation()
      }
      const res = await (
        await requireEmulatorClient()
      ).attach({
        device: target,
        worktree: worktreeId
      })
      if (!mountedRef.current) {
        // Why: attach can finish after the tab closes, after the earlier
        // unmount shutdown already no-op'd because the session was not registered yet.
        await shutdownManagedSimulatorIfNoPane(worktreeId, tabId)
        return
      }
      const attached = res.attached
      const bootedTarget = res.info?.deviceUdid || target
      const nextList = attached ? markSimulatorDeviceBooted(list, bootedTarget) : list
      if (attached) {
        setDevices(nextList)
      }
      applySession(res.info, attached, nextList)
      if (attached) {
        void refreshDevices(bootedTarget)
      }
    } catch (e: unknown) {
      if (requestedTarget && liveTargetRef.current === requestedTarget) {
        return
      }
      // Why: setup failures otherwise trigger the mount auto-attach loop again
      // and erase the actionable error before the user can read it.
      suppressAutoAttachRef.current = true
      const msg = emulatorPaneErrorMessage(
        e,
        'Could not start the emulator. Make sure Xcode and an iOS Simulator runtime are set up, then try another device.'
      )
      setError(msg)
      if (tabId) {
        useAppStore.getState().setTabLabel(tabId, 'Mobile Emulator')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  })

  const effectiveSelectedUdid = selectedUdid ?? configuredDefaultUdid

  const shutdown = useEmulatorPaneShutdown({
    loading,
    mountedRef,
    refreshDevices,
    setError,
    setLoading,
    tabId,
    worktreeId
  })

  useEmulatorPaneLifecycle({ mountedRef, refreshDevices, tabId, worktreeId })

  useEffect(() => {
    if (!autoAttachOnMount || session || loading || suppressAutoAttachRef.current) {
      return
    }
    void attach()
  }, [attach, autoAttachOnMount, loading, session])

  useEmulatorPaneSessionEvents({
    worktreeId,
    applySession,
    refreshDevices,
    clearSessionAfterShutdown
  })

  useEmulatorPaneManualLaunchEvents({
    worktreeId,
    tabId,
    session,
    mountedRef,
    setLoading,
    setError
  })

  const view = buildEmulatorPaneSessionView({
    devices,
    selectedUdid: effectiveSelectedUdid,
    session
  })

  return {
    devices,
    selectedUdid: effectiveSelectedUdid,
    setSelectedUdid,
    session,
    loading,
    error,
    attach,
    shutdown,
    refreshDevices,
    sendTap,
    sendButton,
    sendGesture,
    sendRotate,
    visualOrientation,
    displayName: view.displayName,
    previewUrl: view.previewUrl,
    wsUrl: view.wsUrl,
    streamKey: streamKey ?? undefined,
    isLive: view.isLive,
    selectedDevice: view.selectedDevice
  }
}
