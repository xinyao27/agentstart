import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

import { shellSettingsApi } from './shell-state-client'

// Why: The settings document selects the active runtime, so routing its own storage through that selection would be circular.
export function getRendererSettings(): Promise<GlobalSettings> {
  return shellSettingsApi.get()
}

export function updateRendererSettings(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
  return shellSettingsApi.set(updates)
}

export function updateRendererPRBotAuthorOverride(args: {
  author: string
  isBot: boolean
}): Promise<GlobalSettings> {
  return shellSettingsApi.updatePRBotAuthorOverride(args)
}
