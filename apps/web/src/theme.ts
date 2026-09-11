import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'agentstart-theme'

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => {
    observer.disconnect()
  }
}

// Why: dark is the default, so the opt-in class marks light rather than dark.
function getSnapshot(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

// Why: prerendering has no document, and dark is the base declaration in
// index.css, so the build-time answer has to be dark to match the markup a
// visitor first receives. The store re-reads the real class straight after
// hydration, which corrects a light-mode visitor without a mismatch.
function getServerSnapshot(): Theme {
  return 'dark'
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const toggle = useCallback(() => {
    const next: Theme = getSnapshot() === 'light' ? 'dark' : 'light'
    document.documentElement.classList.toggle('light', next === 'light')
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Why: private browsing may block storage; the class toggle still applies.
    }
  }, [])
  return { theme, toggle }
}
