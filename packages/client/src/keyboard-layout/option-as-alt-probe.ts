/**
 * Runtime probe for the active macOS keyboard layout.
 *
 * Runs detectOptionAsAltFromLayoutMap() at boot and on every window focus-in.
 *
 * Why focus-in and not `layoutchange`: Chromium does not implement the W3C
 * Keyboard API's `layoutchange` event — its Blink IDL exposes only
 * `lock/unlock/getLayoutMap`
 * (chromium/src/third_party/blink/renderer/modules/keyboard/keyboard.idl).
 * Subscribing to `layoutchange` is a no-op. Fortunately every real-world
 * path to switching OS keyboard layout on macOS (Input Menu, Cmd+Space,
 * global shortcut) transfers focus out of AgentStart and back, so focus-in is a
 * reliable proxy. The only missed case is a layout change triggered by a
 * key pressed while AgentStart is focused (e.g. a Karabiner rule), which is
 * exceedingly rare and self-heals on the next blur/focus cycle.
 *
 * The Chrome extension cannot read macOS's native input-source ID, so this
 * uses Chromium's layout fingerprint and keeps the conservative `false`
 * default whenever the map is incomplete or unavailable.
 */
import {
  detectOptionAsAltFromLayoutMap,
  type DetectedLayoutCategory,
  type LayoutMapLike
} from './detect-option-as-alt'

type NavigatorWithKeyboard = Navigator & {
  keyboard?: {
    getLayoutMap: () => Promise<LayoutMapLike>
  }
}

type Listener = (category: DetectedLayoutCategory) => void

export type OptionAsAltProbe = {
  /** Current detected category. Starts `'unknown'` until the first probe
   *  resolves (within a few ms of app boot); listeners fire on every
   *  category change. */
  getCurrent: () => DetectedLayoutCategory
  subscribe: (listener: Listener) => () => void
}

function createOptionAsAltProbe(): OptionAsAltProbe {
  const win = window
  let current: DetectedLayoutCategory = 'unknown'
  const listeners = new Set<Listener>()
  const notify = (next: DetectedLayoutCategory): void => {
    if (next === current) {
      return
    }
    current = next
    for (const listener of listeners) {
      try {
        listener(next)
      } catch (err) {
        console.error('[option-as-alt-probe] listener threw:', err)
      }
    }
  }

  const probe = async (): Promise<void> => {
    const nav = win.navigator as NavigatorWithKeyboard
    const keyboard = nav?.keyboard

    if (!keyboard?.getLayoutMap) {
      // Browser without the Keyboard API. Stay at
      // 'unknown' → terminal defaults to 'false' (safe for non-US).
      notify('unknown')
      return
    }
    try {
      const map = await keyboard.getLayoutMap()
      notify(detectOptionAsAltFromLayoutMap(map))
    } catch (err) {
      // getLayoutMap can reject in some Chromium corner cases (unavailable
      // permission, transient failure). Log once and keep the last known
      // good value so we don't silently regress a user mid-session.
      console.warn('[option-as-alt-probe] getLayoutMap rejected:', err)
    }
  }

  const onFocus = (): void => {
    void probe()
  }

  win.addEventListener('focus', onFocus)

  // Initial probe. Fire-and-forget; callers subscribe and pick up the
  // result as soon as Chromium's layout map resolves.
  void probe()

  return {
    getCurrent: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/** Singleton probe for the renderer, initialized lazily on first use. */
let _singleton: OptionAsAltProbe | null = null

export function getOptionAsAltProbe(): OptionAsAltProbe {
  if (!_singleton) {
    _singleton = createOptionAsAltProbe()
  }
  return _singleton
}
