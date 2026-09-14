import { useEffect, useRef, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

export function useCopyFeedbackState<T>(resetValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState(resetValue)
  const resetTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  const clearResetTimer = useEventCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  })

  // Why: delayed clipboard feedback must not update an unmounted component.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearResetTimer()
    }
  }, [clearResetTimer])

  const showFeedback = (nextValue: T) => {
    if (!mountedRef.current) {
      return
    }
    clearResetTimer()
    setValue(nextValue)
    resetTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) {
        return
      }
      setValue(resetValue)
      resetTimerRef.current = null
    }, 1500)
  }

  return [value, showFeedback]
}
