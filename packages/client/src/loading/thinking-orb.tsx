import { useEffect, useRef } from 'react'
import { MODE_DRAWS, resolvePreset, type OrbState } from 'thinking-orbs'
import { usePrefersReducedMotion } from '~renderer/react/use-prefers-reduced-motion'

const ORB_PRESET_SIZE = 20
const STATIC_FRAME_TIME_SECONDS = 0.6
const MAX_DEVICE_PIXEL_RATIO = 2

type ThinkingOrbLoaderProps = {
  state: OrbState
}

export function ThinkingOrbLoader({ state }: ThinkingOrbLoaderProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    const tintMask = document.createElement('canvas')
    const tintMaskContext = tintMask.getContext('2d')
    const colorProbe = document.createElement('canvas')
    colorProbe.width = 1
    colorProbe.height = 1
    const colorProbeContext = colorProbe.getContext('2d', { willReadFrequently: true })
    if (!tintMaskContext || !colorProbeContext) {
      return
    }

    const { mode, speed, opts } = resolvePreset(state, ORB_PRESET_SIZE)
    const drawMode = MODE_DRAWS[mode]
    let lastAnimationTime = STATIC_FRAME_TIME_SECONDS
    let tintColor = ''
    let useDarkSurfacePalette = true

    const draw = (animationTime: number): void => {
      lastAnimationTime = animationTime
      const nextTintColor = window.getComputedStyle(canvas).color
      if (nextTintColor !== tintColor) {
        tintColor = nextTintColor
        colorProbeContext.clearRect(0, 0, 1, 1)
        colorProbeContext.fillStyle = tintColor
        colorProbeContext.fillRect(0, 0, 1, 1)
        const [red, green, blue] = colorProbeContext.getImageData(0, 0, 1, 1).data
        useDarkSurfacePalette = 0.2126 * red + 0.7152 * green + 0.0722 * blue >= 128
      }
      const bounds = canvas.getBoundingClientRect()
      const cssSize = Math.max(
        1,
        Math.min(bounds.width || ORB_PRESET_SIZE, bounds.height || ORB_PRESET_SIZE)
      )
      const pixelRatio = Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1)
      const pixelSize = Math.max(1, Math.round(cssSize * pixelRatio))
      if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
        canvas.width = pixelSize
        canvas.height = pixelSize
        tintMask.width = pixelSize
        tintMask.height = pixelSize
      }

      const scale = (cssSize * pixelRatio) / ORB_PRESET_SIZE
      context.setTransform(scale, 0, 0, scale, 0, 0)
      context.clearRect(0, 0, ORB_PRESET_SIZE, ORB_PRESET_SIZE)
      drawMode(context, ORB_PRESET_SIZE, animationTime, useDarkSurfacePalette, opts)

      tintMaskContext.setTransform(1, 0, 0, 1, 0, 0)
      tintMaskContext.clearRect(0, 0, pixelSize, pixelSize)
      tintMaskContext.drawImage(canvas, 0, 0)

      // Why: upstream paints fixed grayscale; tinting the pixels preserves its depth while honoring AgentStart's semantic currentColor.
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.globalCompositeOperation = 'color'
      context.fillStyle = tintColor
      context.fillRect(0, 0, pixelSize, pixelSize)
      context.globalCompositeOperation = 'destination-in'
      context.drawImage(tintMask, 0, 0)
      context.globalCompositeOperation = 'source-over'
    }

    const drawCurrentFrame = (): void => {
      draw(prefersReducedMotion ? STATIC_FRAME_TIME_SECONDS : lastAnimationTime)
    }
    const resizeObserver = new ResizeObserver(drawCurrentFrame)
    resizeObserver.observe(canvas)

    if (prefersReducedMotion) {
      draw(STATIC_FRAME_TIME_SECONDS)
      const colorHost = canvas.closest('button') ?? canvas.parentElement ?? canvas
      colorHost.addEventListener('pointerenter', drawCurrentFrame)
      colorHost.addEventListener('pointerleave', drawCurrentFrame)
      colorHost.addEventListener('focusin', drawCurrentFrame)
      colorHost.addEventListener('focusout', drawCurrentFrame)
      const colorObserver = new MutationObserver(drawCurrentFrame)
      let colorAncestor = canvas.parentElement
      while (colorAncestor) {
        colorObserver.observe(colorAncestor, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-state', 'data-theme', 'data-variant']
        })
        colorAncestor = colorAncestor.parentElement
      }
      return () => {
        resizeObserver.disconnect()
        colorObserver.disconnect()
        colorHost.removeEventListener('pointerenter', drawCurrentFrame)
        colorHost.removeEventListener('pointerleave', drawCurrentFrame)
        colorHost.removeEventListener('focusin', drawCurrentFrame)
        colorHost.removeEventListener('focusout', drawCurrentFrame)
      }
    }

    let animationFrame = 0
    let running = false
    let intersecting = true
    const animate = (timestamp: number): void => {
      draw((timestamp / 1_000) * speed)
      if (running) {
        animationFrame = window.requestAnimationFrame(animate)
      }
    }
    const start = (): void => {
      if (running || document.visibilityState === 'hidden' || !intersecting) {
        return
      }
      running = true
      animationFrame = window.requestAnimationFrame(animate)
    }
    const stop = (): void => {
      running = false
      window.cancelAnimationFrame(animationFrame)
    }
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      if (intersecting) {
        start()
      } else {
        stop()
      }
    })
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        stop()
      } else {
        start()
      }
    }

    draw((performance.now() / 1_000) * speed)
    intersectionObserver.observe(canvas)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    start()
    return () => {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [prefersReducedMotion, state])

  return (
    <canvas ref={canvasRef} role="presentation" aria-hidden="true" className="block size-full" />
  )
}
