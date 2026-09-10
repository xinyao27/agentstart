import {
  normalizeTuiAgentArgsRecord,
  normalizeTuiAgentEnvRecord
} from '@agentstart/protocol/agent/launch/settings'
import { normalizeDisabledTuiAgents } from '@agentstart/protocol/agent/selection'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { normalizeLoaderStyle } from '@agentstart/protocol/settings/loader'
import { normalizeOpenInApplications } from '@agentstart/protocol/settings/open-in'
import { normalizeUiLanguage } from '@agentstart/protocol/settings/ui-language'
import { normalizeTerminalQuickCommands } from '@agentstart/protocol/terminal/quick-commands'
import { normalizeDesktopTerminalScrollbackRows } from '@agentstart/protocol/terminal/scrollback-policy'
import type { StateCreator } from 'zustand'
import { bumpProviderRuntimeSessionGeneration } from '~renderer/agent/provider-runtime-context'
import { readProjectCatalogQueryClient } from '~renderer/project-catalog/catalog-snapshot'
import {
  invalidateProjectCatalogTarget,
  refreshProjectCatalogLineage
} from '~renderer/project-catalog/refresh'
import { assertRuntimeStatusCompatible } from '~renderer/runtime/protocol-compat'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import {
  clearRuntimeCompatibilityCache,
  markRuntimeEnvironmentCompatible
} from '~renderer/runtime/rpc-client'
import { runtimeEnvironmentsClient } from '~renderer/runtime/runtime-environments-client'
import { getRendererSettings, updateRendererSettings } from '~renderer/runtime/settings-client'
import type { AppState } from '~renderer/store/types'
import { normalizeTerminalCustomThemes } from '~renderer/terminal/themes/custom'

import { createSettingsSearchState, type SettingsSearchState } from './search-state'

export type SettingsSlice = SettingsSearchState & {
  settings: GlobalSettings | null
  fetchSettings: () => Promise<void>
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  switchRuntimeEnvironment: (environmentId: string | null) => Promise<boolean>
}

type LegacyTerminalScrollbackSettingsUpdate = Partial<GlobalSettings> & {
  terminalScrollbackBytes?: unknown
}

function normalizeRuntimeEnvironmentId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function createOpenInApplicationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `open-in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

async function verifyRuntimeEnvironmentReachable(environmentId: string | null): Promise<void> {
  if (!environmentId) {
    return
  }
  const status = await runtimeEnvironmentsClient.getStatus({
    selector: environmentId,
    timeoutMs: 15_000
  })

  assertRuntimeStatusCompatible(status)
  // Why: the switch probe already proved compatibility; avoid immediately
  // re-probing through the heavier generic runtime RPC path during hydration.
  markRuntimeEnvironmentCompatible(environmentId)
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set, get) => ({
  settings: null,
  ...createSettingsSearchState((state) => set(state)),

  fetchSettings: async () => {
    try {
      const settings = await getRendererSettings()
      set({ settings })
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    }
  },

  updateSettings: async (updates) => {
    try {
      const { terminalScrollbackBytes: _legacyScrollbackBytes, ...sanitizedUpdates } =
        updates as LegacyTerminalScrollbackSettingsUpdate
      void _legacyScrollbackBytes
      if ('terminalQuickCommands' in updates) {
        sanitizedUpdates.terminalQuickCommands = normalizeTerminalQuickCommands(
          updates.terminalQuickCommands
        )
      }
      if ('terminalCustomThemes' in updates) {
        sanitizedUpdates.terminalCustomThemes = normalizeTerminalCustomThemes(
          updates.terminalCustomThemes
        )
      }
      if ('openInApplications' in updates) {
        sanitizedUpdates.openInApplications = normalizeOpenInApplications(
          updates.openInApplications,
          {
            createId: createOpenInApplicationId
          }
        )
      }
      if ('disabledTuiAgents' in updates) {
        sanitizedUpdates.disabledTuiAgents = normalizeDisabledTuiAgents(updates.disabledTuiAgents)
      }
      if ('agentDefaultArgs' in updates) {
        sanitizedUpdates.agentDefaultArgs = normalizeTuiAgentArgsRecord(updates.agentDefaultArgs)
        sanitizedUpdates.agentYoloDefaultsMigrated = true
      }
      if ('agentDefaultEnv' in updates) {
        sanitizedUpdates.agentDefaultEnv = normalizeTuiAgentEnvRecord(updates.agentDefaultEnv)
        sanitizedUpdates.agentYoloDefaultsMigrated = true
      }
      if ('uiLanguage' in updates) {
        sanitizedUpdates.uiLanguage = normalizeUiLanguage(updates.uiLanguage)
      }
      if ('loaderStyle' in updates) {
        sanitizedUpdates.loaderStyle = normalizeLoaderStyle(updates.loaderStyle)
      }
      if ('terminalScrollbackRows' in updates) {
        sanitizedUpdates.terminalScrollbackRows = normalizeDesktopTerminalScrollbackRows(
          updates.terminalScrollbackRows
        )
      }
      const nextSettings = await updateRendererSettings(sanitizedUpdates)
      set((s) => ({ settings: (nextSettings as GlobalSettings | undefined) ?? s.settings }))
    } catch (err) {
      console.error('Failed to update settings:', err)
    }
  },

  switchRuntimeEnvironment: async (environmentId) => {
    const nextId = normalizeRuntimeEnvironmentId(environmentId)
    const previousId = normalizeRuntimeEnvironmentId(get().settings?.activeRuntimeEnvironmentId)
    if (previousId === nextId) {
      return true
    }
    try {
      clearRuntimeCompatibilityCache(nextId)
      await verifyRuntimeEnvironmentReachable(nextId)
      const nextSettings = await updateRendererSettings({
        activeRuntimeEnvironmentId: nextId
      })
      bumpProviderRuntimeSessionGeneration()
      set((s) => ({
        // Why: in the multi-host model this is a focus/default-host change,
        // not a teardown boundary. Existing host-owned sessions stay alive.
        settings:
          (nextSettings as GlobalSettings | undefined) ??
          (s.settings ? { ...s.settings, activeRuntimeEnvironmentId: nextId } : null)
      }))
      const target = nextId
        ? ({ kind: 'environment', environmentId: nextId } as const)
        : ({ kind: 'local' } as const)
      const queryClient = readProjectCatalogQueryClient()
      await Promise.all([
        invalidateProjectCatalogTarget(queryClient, target),
        refreshProjectCatalogLineage(queryClient, target)
      ])
      return true
    } catch (err) {
      console.error('Failed to switch runtime environment:', err)
      publishRendererCommandResult({
        type: 'runtime-environment-switch-failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return false
    }
  }
})
