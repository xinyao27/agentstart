const BROWSER_PAGE_ZOOM_STEP = 0.5
const BROWSER_PAGE_ZOOM_MIN = -3
const BROWSER_PAGE_ZOOM_MAX = 5
export const DEFAULT_BROWSER_PAGE_ZOOM_LEVEL = 0

export function normalizeBrowserPageZoomLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_BROWSER_PAGE_ZOOM_LEVEL
  }
  const roundedToStep = Math.round(value / BROWSER_PAGE_ZOOM_STEP) * BROWSER_PAGE_ZOOM_STEP
  return Math.max(BROWSER_PAGE_ZOOM_MIN, Math.min(BROWSER_PAGE_ZOOM_MAX, roundedToStep))
}
