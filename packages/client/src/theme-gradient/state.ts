import {
  normalizeThemeGradient,
  type ThemeGradientTheme
} from '@agentstart/protocol/settings/theme-gradient'
import type { StateCreator } from 'zustand'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import type { AppState } from '~renderer/store/types'

// Why: hydration lives in the UI slice with every other persisted view-state
// field, so this slice only owns writes and reads.

/** Which theme a picker edit targets. */
export type ThemeGradientScope = { kind: 'default' } | { kind: 'workspace'; workspaceId: string }

export type ThemeGradientSlice = {
  themeGradientDefault: ThemeGradientTheme | null
  themeGradientsByWorkspaceId: Record<string, ThemeGradientTheme>
  setThemeGradient: (scope: ThemeGradientScope, theme: ThemeGradientTheme | null) => void
}

export type ThemeGradientLookup = Pick<
  ThemeGradientSlice,
  'themeGradientDefault' | 'themeGradientsByWorkspaceId'
>

export function resolveThemeGradient(
  state: ThemeGradientLookup,
  workspaceId: string | null
): ThemeGradientTheme | null {
  if (workspaceId) {
    const override = state.themeGradientsByWorkspaceId[workspaceId]
    if (override) {
      return override
    }
  }
  return state.themeGradientDefault
}

export const createThemeGradientSlice: StateCreator<AppState, [], [], ThemeGradientSlice> = (
  set,
  get
) => ({
  themeGradientDefault: null,
  themeGradientsByWorkspaceId: {},

  setThemeGradient: (scope, theme) => {
    const normalized = theme ? normalizeThemeGradient(theme) : null
    if (scope.kind === 'default') {
      set({ themeGradientDefault: normalized })
      setRuntimeUIState(get().settings, { themeGradientDefault: normalized }).catch(console.error)
      return
    }
    const next = { ...get().themeGradientsByWorkspaceId }
    if (normalized) {
      next[scope.workspaceId] = normalized
    } else {
      // Why: clearing a workspace override must fall back to the default theme,
      // which a persisted `null` entry would shadow.
      delete next[scope.workspaceId]
    }
    set({ themeGradientsByWorkspaceId: next })
    setRuntimeUIState(get().settings, { themeGradientsByWorkspaceId: next }).catch(console.error)
  }
})
