import type { CSSProperties, PointerEvent, WheelEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

import {
  fitDeviceFrameToPane,
  resolveVisualStreamGeometry,
  resolveDeviceFrameKind,
  type EmulatorDeviceVisualOrientation,
  type StreamSize
} from './emulator-device-frame-layout'
import { PhoneHardwareButtons } from './emulator-phone-hardware-buttons'
import {
  buildWheelGesturePoints,
  clampEmulatorScreenPoint,
  buildEmulatorGesturePoint,
  mapClientPointToSimulatorScreen,
  resolveEmulatorWheelDelta,
  resolveEmulatorHomeIndicatorEdge,
  resolveEmulatorPointerAction,
  type EmulatorScreenPoint,
  type EmulatorGesturePoint,
  type PointerSample
} from './emulator-screen-gesture'
import { EmulatorScreenSurface } from './emulator-screen-surface'
import { useEmulatorControlStream } from './use-emulator-control-stream'
import { useEmulatorPaneSize } from './use-emulator-pane-size'
import { useEmulatorScreenKeyboard } from './use-emulator-screen-keyboard'

type EmulatorDeviceFrameProps = {
  previewUrl?: string
  wsUrl?: string
  streamKey?: string
  deviceName?: string
  loading: boolean
  isLive: boolean
  visualOrientation: EmulatorDeviceVisualOrientation
  /** False when backgrounded; parks the stream with the pane's visibility. */
  isActive: boolean
  onTap: (x: number, y: number) => void
  onGesture: (points: EmulatorGesturePoint[]) => void
}

const MAX_GESTURE_SAMPLES = 32,
  WHEEL_GESTURE_IDLE_MS = 80
type PendingWheelGesture = {
  end: EmulatorScreenPoint
  live: boolean
  start: EmulatorScreenPoint
  timerId: number | null
}

type ScreenCoordinateEvent = Pick<
  PointerEvent<HTMLDivElement>,
  'clientX' | 'clientY' | 'currentTarget'
>

// Why: tagging the resolved size/error with the previewUrl+streamKey identity
// lets stale values from a prior device or stream refresh be discarded during
// render, so no reset effect is needed to clear them on prop change.
type StreamGeometryState = { identity: string; size: StreamSize | null; error: boolean }

type EmulatorDeviceFrameStyle = CSSProperties & {
  '--agentstart-emulator-frame-inner-radius': string
  '--agentstart-emulator-frame-outer-radius': string
}

export function EmulatorDeviceFrame({
  previewUrl,
  wsUrl,
  streamKey,
  deviceName,
  loading,
  isLive,
  visualOrientation,
  isActive,
  onTap,
  onGesture
}: EmulatorDeviceFrameProps) {
  const { paneRef, paneSize } = useEmulatorPaneSize()
  const pointerSamplesRef = useRef<PointerSample[] | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const liveTouchRef = useRef(false)
  const liveTouchEdgeRef = useRef<number | undefined>(undefined)
  const lastTouchPointRef = useRef<EmulatorScreenPoint | null>(null)
  const wheelGestureRef = useRef<PendingWheelGesture | null>(null)
  const streamIdentity = `${previewUrl ?? ''}::${streamKey ?? ''}`
  const [streamGeometryState, setStreamGeometryState] = useState<StreamGeometryState>({
    identity: streamIdentity,
    size: null,
    error: false
  })
  const isCurrentStreamGeometry = streamGeometryState.identity === streamIdentity
  const streamSize = isCurrentStreamGeometry ? streamGeometryState.size : null
  const streamError = isCurrentStreamGeometry && streamGeometryState.error
  const visualStreamGeometry = (() => resolveVisualStreamGeometry(streamSize, visualOrientation))()
  const canInteract = isLive && !loading && !streamError
  const { cancelKeyboardFrames, sendKeyboardFrames, sendTouch } = useEmulatorControlStream(
    wsUrl,
    canInteract
  )
  const { enableKeyboardCapture, handleBlur, handleKeyDown, handlePaste, keyboardCaptureActive } =
    useEmulatorScreenKeyboard({
      cancelKeyboardFrames,
      canInteract,
      sendKeyboardFrames
    })

  const mapEventToScreenPoint = (event: ScreenCoordinateEvent): EmulatorScreenPoint | null =>
    mapClientPointToSimulatorScreen(
      { clientX: event.clientX, clientY: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      visualStreamGeometry.size
    )

  const sendGesturePoints = (points: EmulatorGesturePoint[]) => {
    void onGesture(points)
  }

  const flushWheelGesture = () => {
    const pending = wheelGestureRef.current
    wheelGestureRef.current = null
    if (!pending) {
      return
    }
    if (pending.timerId !== null) {
      window.clearTimeout(pending.timerId)
    }
    if (pending.live) {
      const end = clampEmulatorScreenPoint(pending.end)
      void sendTouch({ ...end, type: 'end' })
      return
    }
    const points = buildWheelGesturePoints(pending.start, pending.end)
    if (points) {
      sendGesturePoints(points)
    }
  }

  useEffect(
    () => () => {
      const pending = wheelGestureRef.current
      if (pending?.timerId != null) {
        window.clearTimeout(pending.timerId)
      }
      if (pending?.live) {
        const end = clampEmulatorScreenPoint(pending.end)
        void sendTouch({ ...end, type: 'end' })
      }
      const point = lastTouchPointRef.current
      if (liveTouchRef.current && point) {
        void sendTouch(buildEmulatorGesturePoint(point, 'end', liveTouchEdgeRef.current))
      }
      wheelGestureRef.current = null
      liveTouchRef.current = false
      liveTouchEdgeRef.current = undefined
      lastTouchPointRef.current = null
    },
    [sendTouch]
  )

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canInteract || event.button !== 0) {
      return
    }
    event.preventDefault()
    try {
      event.currentTarget.focus({ preventScroll: true })
    } catch {}
    enableKeyboardCapture()
    const point = mapEventToScreenPoint(event)
    if (!point) {
      return
    }
    activePointerIdRef.current = event.pointerId
    pointerSamplesRef.current = [{ clientX: event.clientX, clientY: event.clientY }]
    lastTouchPointRef.current = point
    liveTouchEdgeRef.current = resolveEmulatorHomeIndicatorEdge(point)
    // Why: serve-sim's native viewer streams touch phases live; replaying the
    // whole drag after pointer-up can be ignored by iOS gesture recognizers.
    liveTouchRef.current = sendTouch(
      buildEmulatorGesturePoint(point, 'begin', liveTouchEdgeRef.current)
    )
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {}
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const samples = pointerSamplesRef.current
    if (!samples || activePointerIdRef.current !== event.pointerId) {
      return
    }
    event.preventDefault()
    const last = samples.at(-1)
    if (last && Math.hypot(event.clientX - last.clientX, event.clientY - last.clientY) < 4) {
      return
    }
    const sample = { clientX: event.clientX, clientY: event.clientY }
    if (samples.length < MAX_GESTURE_SAMPLES - 1) {
      samples.push(sample)
    } else {
      samples[samples.length - 1] = sample
    }
    if (!liveTouchRef.current) {
      return
    }
    const point = mapEventToScreenPoint(event)
    if (point) {
      lastTouchPointRef.current = point
      void sendTouch(buildEmulatorGesturePoint(point, 'move', liveTouchEdgeRef.current))
    }
  }

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }
    const point = lastTouchPointRef.current
    if (liveTouchRef.current && point) {
      void sendTouch(buildEmulatorGesturePoint(point, 'end', liveTouchEdgeRef.current))
    }
    pointerSamplesRef.current = null
    activePointerIdRef.current = null
    liveTouchRef.current = false
    liveTouchEdgeRef.current = undefined
    lastTouchPointRef.current = null
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const samples = pointerSamplesRef.current
    if (!samples || activePointerIdRef.current !== event.pointerId) {
      return
    }
    event.preventDefault()
    pointerSamplesRef.current = null
    activePointerIdRef.current = null
    const endPoint = mapEventToScreenPoint(event) ?? lastTouchPointRef.current
    if (liveTouchRef.current) {
      if (endPoint) {
        void sendTouch(buildEmulatorGesturePoint(endPoint, 'end', liveTouchEdgeRef.current))
      }
      liveTouchRef.current = false
      liveTouchEdgeRef.current = undefined
      lastTouchPointRef.current = null
      return
    }
    liveTouchEdgeRef.current = undefined
    lastTouchPointRef.current = null
    if (!canInteract) {
      return
    }
    samples.push({ clientX: event.clientX, clientY: event.clientY })
    const action = resolveEmulatorPointerAction(
      samples,
      event.currentTarget.getBoundingClientRect(),
      visualStreamGeometry.size
    )
    if (!action) {
      return
    }
    if (action.kind === 'tap') {
      void onTap(action.point.x, action.point.y)
    } else {
      sendGesturePoints(action.points)
    }
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!canInteract) {
      return
    }
    const delta = resolveEmulatorWheelDelta(
      {
        clientX: event.clientX,
        clientY: event.clientY,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY
      },
      event.currentTarget.getBoundingClientRect(),
      visualStreamGeometry.size
    )
    if (!delta) {
      return
    }
    event.preventDefault()
    const previous = wheelGestureRef.current
    if (previous?.timerId != null) {
      window.clearTimeout(previous.timerId)
    }
    const start = previous?.start ?? delta.start
    const end = clampEmulatorScreenPoint(
      previous
        ? { x: previous.end.x + delta.delta.x, y: previous.end.y + delta.delta.y }
        : { x: delta.start.x + delta.delta.x, y: delta.start.y + delta.delta.y }
    )
    const live = previous?.live ?? sendTouch({ ...start, type: 'begin' })
    if (live) {
      void sendTouch({ ...end, type: 'move' })
    }
    wheelGestureRef.current = {
      start,
      end,
      live,
      timerId: window.setTimeout(flushWheelGesture, WHEEL_GESTURE_IDLE_MS)
    }
  }

  const handleStreamSize = (size: NonNullable<StreamSize>) => {
    setStreamGeometryState((current) => {
      const same = current.size?.width === size.width && current.size?.height === size.height
      return current.identity === streamIdentity && !current.error && same
        ? current
        : { identity: streamIdentity, size, error: false }
    })
  }

  const handleStreamError = () => {
    setStreamGeometryState((current) => ({
      identity: streamIdentity,
      size: current.identity === streamIdentity ? current.size : null,
      error: true
    }))
  }

  // Why: hidden panes still receive emulator frames, including over SSH, so
  // parking the stream avoids background decode/IPC churn while staying attached.
  const showStream = isActive && isLive && Boolean(previewUrl)
  const streamAspectRatio = streamSize ? streamSize.width / streamSize.height : 9 / 19
  // Why: serve-sim may keep portrait-sized pixels for portrait-locked apps; the
  // physical frame still follows the last successful rotate request.
  const screenAspectRatio = visualStreamGeometry.aspectRatio
  const frameKind = (() => resolveDeviceFrameKind(deviceName, streamAspectRatio))()
  const frameLayout = (() => fitDeviceFrameToPane(paneSize, screenAspectRatio, frameKind))()
  const frameStyle = {
    left: frameLayout ? `${frameLayout.hardwareOutset}px` : undefined,
    width: frameLayout ? `${frameLayout.shellWidth}px` : '100%',
    height: frameLayout ? `${frameLayout.shellHeight}px` : undefined,
    padding: frameLayout ? undefined : '10px',
    '--agentstart-emulator-frame-inner-radius': frameLayout
      ? `${frameLayout.innerRadius}px`
      : '44px',
    '--agentstart-emulator-frame-outer-radius': frameLayout
      ? `${frameLayout.outerRadius}px`
      : '54px'
  } satisfies EmulatorDeviceFrameStyle

  return (
    <div
      ref={paneRef}
      className="bg-muted flex min-h-0 flex-1 items-center justify-center overflow-hidden"
    >
      <div
        className="relative"
        style={{
          width: frameLayout ? `${frameLayout.width}px` : '100%',
          maxWidth: frameLayout ? undefined : '460px',
          height: frameLayout ? `${frameLayout.height}px` : undefined
        }}
      >
        {frameLayout?.kind === 'phone' ? <PhoneHardwareButtons layout={frameLayout} /> : null}
        <div
          data-agentstart-emulator-frame="true"
          className="relative overflow-hidden bg-black"
          style={frameStyle}
        >
          <EmulatorScreenSurface
            frameLayout={frameLayout}
            isLive={isLive}
            keyboardCaptureActive={keyboardCaptureActive}
            loading={loading}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onStreamError={handleStreamError}
            onStreamSize={handleStreamSize}
            onWheel={handleWheel}
            previewUrl={previewUrl}
            screenAspectRatio={screenAspectRatio}
            showStream={Boolean(showStream)}
            streamError={streamError}
            streamKey={streamKey}
            streamRotation={visualStreamGeometry.streamRotation}
          />
        </div>
      </div>
    </div>
  )
}
