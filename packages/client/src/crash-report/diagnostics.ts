import type {
  CrashReportBreadcrumbData,
  CrashReportDetailValue
} from '@yiru/protocol/crash-reports/values'

import { recordRendererCrashBreadcrumb } from './breadcrumb-recorder'
import { collectRendererMemoryProfileCounts } from './memory-profile'
import { reportRendererErrorCrash } from './renderer-error'

const RENDERER_MEMORY_SAMPLE_INTERVAL_MS = 60_000
const BYTES_PER_MEGABYTE = 1024 * 1024
const RENDERER_MEMORY_HIGHWATER_RATIOS = [0.6, 0.8] as const

type BrowserPerformanceMemory = {
  usedJSHeapSize?: number
  totalJSHeapSize?: number
  jsHeapSizeLimit?: number
}

let rendererCrashDiagnosticsInstalled = false
let rendererMemoryInterval: number | null = null
const emittedHighwaterRatios = new Set<number>()

// Why re-exported from a leaf module: terminal hot paths need breadcrumb
// recording without this file's import.meta and global diagnostics baggage.
export { recordRendererCrashBreadcrumb } from './breadcrumb-recorder'

export function installRendererCrashDiagnostics(): void {
  if (rendererCrashDiagnosticsInstalled || typeof window === 'undefined') {
    return
  }

  rendererCrashDiagnosticsInstalled = true
  window.addEventListener('error', recordRendererError)
  window.addEventListener('unhandledrejection', recordRendererUnhandledRejection)

  if (getPerformanceMemory()) {
    recordRendererMemory('startup')
    rendererMemoryInterval = window.setInterval(
      () => recordRendererMemory('interval'),
      RENDERER_MEMORY_SAMPLE_INTERVAL_MS
    )
  }
}

function disposeRendererCrashDiagnostics(): void {
  if (!rendererCrashDiagnosticsInstalled || typeof window === 'undefined') {
    return
  }
  rendererCrashDiagnosticsInstalled = false
  window.removeEventListener('error', recordRendererError)
  window.removeEventListener('unhandledrejection', recordRendererUnhandledRejection)
  if (rendererMemoryInterval !== null) {
    window.clearInterval(rendererMemoryInterval)
    rendererMemoryInterval = null
  }
  emittedHighwaterRatios.clear()
}

if (typeof import.meta !== 'undefined' && import.meta.hot) {
  // Why: Vite can replace this module without a full renderer reload. Remove
  // global diagnostics hooks so dev sessions do not accumulate listeners.
  import.meta.hot.dispose(disposeRendererCrashDiagnostics)
}

function recordRendererError(event: ErrorEvent): void {
  // Why: "ResizeObserver loop completed" is a benign, self-resolving Chromium
  // quirk. Recording it fills the breadcrumb buffer and inflates the error
  // count without diagnostic value, contributing to renderer heap growth (#8260).
  if (
    /^ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)\.?$/i.test(
      event.message
    )
  ) {
    event.preventDefault()
    return
  }
  recordRendererCrashBreadcrumb(
    'renderer_error',
    compactBreadcrumbData({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      ...describeUnknownValue('error', event.error)
    })
  )
  void reportRendererErrorCrash({
    kind: 'renderer-unhandled-error',
    originId: 'window-error',
    surface: 'app-root',
    error: event.error ?? new Error(event.message)
  })
}

function recordRendererMemoryHighwater(memory: BrowserPerformanceMemory): void {
  const used = memory.usedJSHeapSize
  const limit = memory.jsHeapSizeLimit
  // Why: invalid heap metrics must not spuriously consume the session's one-shot profiles.
  if (!isFiniteHeapBytes(used) || !isFiniteHeapBytes(limit) || limit <= 0) {
    return
  }
  const ratio = used / limit
  if (
    !RENDERER_MEMORY_HIGHWATER_RATIOS.some(
      (threshold) => ratio >= threshold && !emittedHighwaterRatios.has(threshold)
    )
  ) {
    return
  }

  // Why: one sample can cross both thresholds; profile the large heap only once.
  const profile = compactBreadcrumbData({
    rendererSurface: 'main',
    usedHeapMB: toMegabytes(used),
    totalHeapMB: toMegabytes(memory.totalJSHeapSize),
    heapLimitMB: toMegabytes(limit),
    domNodes: document.getElementsByTagName('*').length,
    terminalElements: document.querySelectorAll('.xterm').length,
    ...collectRendererMemoryProfileCounts()
  })
  for (const threshold of RENDERER_MEMORY_HIGHWATER_RATIOS) {
    if (ratio < threshold || emittedHighwaterRatios.has(threshold)) {
      continue
    }
    emittedHighwaterRatios.add(threshold)
    recordRendererCrashBreadcrumb('renderer_memory_highwater', {
      ...profile,
      thresholdPct: Math.round(threshold * 100)
    })
  }
}

function isFiniteHeapBytes(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function recordRendererUnhandledRejection(event: PromiseRejectionEvent): void {
  recordRendererCrashBreadcrumb(
    'renderer_unhandled_rejection',
    compactBreadcrumbData(describeUnknownValue('reason', event.reason))
  )
  void reportRendererErrorCrash({
    kind: 'renderer-unhandled-error',
    originId: 'unhandled-rejection',
    surface: 'app-root',
    error: event.reason
  })
}

function recordRendererMemory(reason: string): void {
  const memory = getPerformanceMemory()
  if (!memory) {
    return
  }
  recordRendererCrashBreadcrumb(
    'renderer_memory',
    compactBreadcrumbData({
      reason,
      usedHeapMB: toMegabytes(memory.usedJSHeapSize),
      totalHeapMB: toMegabytes(memory.totalJSHeapSize),
      heapLimitMB: toMegabytes(memory.jsHeapSizeLimit)
    })
  )
  recordRendererMemoryHighwater(memory)
}

function getPerformanceMemory(): BrowserPerformanceMemory | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window.performance as Performance & { memory?: BrowserPerformanceMemory }).memory
}

function describeUnknownValue(
  prefix: string,
  value: unknown
): Record<string, CrashReportDetailValue | undefined> {
  if (value === null) {
    return { [`${prefix}Type`]: 'null' }
  }
  if (value === undefined) {
    return { [`${prefix}Type`]: 'undefined' }
  }
  if (typeof value === 'object' || typeof value === 'function') {
    const candidate = value as {
      name?: unknown
      message?: unknown
      stack?: unknown
      constructor?: { name?: string }
    }
    return {
      [`${prefix}Type`]: typeof value === 'function' ? 'function' : candidate.constructor?.name,
      [`${prefix}Name`]: typeof candidate.name === 'string' ? candidate.name : undefined,
      [`${prefix}Message`]: typeof candidate.message === 'string' ? candidate.message : undefined,
      [`${prefix}Stack`]: typeof candidate.stack === 'string' ? candidate.stack : undefined
    }
  }

  return {
    [`${prefix}Type`]: typeof value,
    [`${prefix}Message`]: stringifyUnknown(value)
  }
}

function stringifyUnknown(value: unknown): string {
  try {
    return String(value)
  } catch {
    return '[unstringifiable]'
  }
}

function compactBreadcrumbData(
  data: Record<string, CrashReportDetailValue | undefined>
): CrashReportBreadcrumbData {
  const compacted: CrashReportBreadcrumbData = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
      compacted[key] = value
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      compacted[key] = value
    }
  }
  return compacted
}

function toMegabytes(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value / BYTES_PER_MEGABYTE)
    : undefined
}
