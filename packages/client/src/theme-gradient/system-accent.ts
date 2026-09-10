import { useEffect, useState } from 'react'
import { readSystemAccentColor } from '~renderer/runtime/shell-platform-client'

const SYSTEM_ACCENT_REFRESH_MS = 30_000

export function useSystemAccentColor(enabled: boolean): string | null {
  const [color, setColor] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }
    const controller = new AbortController()
    let pending = false
    const refresh = async (): Promise<void> => {
      if (pending || document.visibilityState === 'hidden' || controller.signal.aborted) {
        return
      }
      pending = true
      try {
        const next = await readSystemAccentColor(controller.signal)
        if (!controller.signal.aborted) {
          setColor(next)
        }
      } catch {
        // Why: older daemons and headless hosts may not expose a native accent.
        if (!controller.signal.aborted) {
          setColor(null)
        }
      } finally {
        pending = false
      }
    }
    // Why: native accent changes do not emit a browser media query event.
    // Refresh on return to the app, with a visible-page poll for side-by-side settings changes.
    void refresh()
    const interval = window.setInterval(() => void refresh(), SYSTEM_ACCENT_REFRESH_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled])

  return enabled ? color : null
}
