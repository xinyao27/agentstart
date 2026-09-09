import type { StateCreator } from 'zustand'
import { normalizeKagiSessionLink } from '~renderer/browser/session/kagi-link'
import { normalizeBrowserPageZoomLevel } from '~renderer/browser/zoom'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'

import type { AppState } from '../../store/types'
import type { UISlice } from './slice'

export function createUIUpdateActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'setUpdateStatus'
  | 'setIsFullScreen'
  | 'setBrowserDefaultUrl'
  | 'setBrowserDefaultSearchEngine'
  | 'setBrowserDefaultZoomLevel'
  | 'setBrowserKagiSessionLink'
> {
  return {
    setUpdateStatus: (status) => set({ updateStatus: status }),
    setIsFullScreen: (value) => set({ isFullScreen: value }),
    setBrowserDefaultUrl: (url) => {
      void setRuntimeUIState(get().settings, { browserDefaultUrl: url }).catch(console.error)
      set({ browserDefaultUrl: url })
    },
    setBrowserDefaultSearchEngine: (engine) => {
      void setRuntimeUIState(get().settings, { browserDefaultSearchEngine: engine }).catch(
        console.error
      )
      set({ browserDefaultSearchEngine: engine })
    },
    setBrowserDefaultZoomLevel: (level) => {
      const normalized = normalizeBrowserPageZoomLevel(level)
      void setRuntimeUIState(get().settings, { browserDefaultZoomLevel: normalized }).catch(
        console.error
      )
      set({ browserDefaultZoomLevel: normalized })
    },
    setBrowserKagiSessionLink: (link) => {
      const normalized = link ? normalizeKagiSessionLink(link) : null
      void setRuntimeUIState(get().settings, { browserKagiSessionLink: normalized }).catch(
        console.error
      )
      set({ browserKagiSessionLink: normalized })
    }
  }
}
