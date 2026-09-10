import type {
  WarpThemeImportPreview,
  WarpThemeImportSource
} from '@agentstart/protocol/terminal/theme-types'
import { ghosttyImportPreview, warpImportPreview } from '~renderer/settings/import-preview'
import type { GhosttyImportPreview } from '~renderer/settings/import-preview'
import { useAppStore } from '~renderer/store/state'

import { getActiveRuntimeTarget } from './rpc-client'
import { requireSettingsProtocolClient } from './settings-protocol-target'

// Why: fonts/Ghostty/Warp all read the active target's filesystem, not the
// shell's — a desktop paired to a remote environment should see that host's
// fonts and terminal-emulator configs, not always its own local machine's.
function activeSettingsImportTarget() {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export async function listInstalledFontFamilies(): Promise<string[]> {
  const client = await requireSettingsProtocolClient(activeSettingsImportTarget())
  return client.listFonts()
}

export async function previewGhosttyImportOnActiveHost(): Promise<GhosttyImportPreview> {
  const client = await requireSettingsProtocolClient(activeSettingsImportTarget())
  return ghosttyImportPreview(await client.previewGhosttyImport())
}

export async function previewWarpThemeImportOnActiveHost(
  source: WarpThemeImportSource
): Promise<WarpThemeImportPreview> {
  const client = await requireSettingsProtocolClient(activeSettingsImportTarget())
  return warpImportPreview(await client.previewWarpThemeImport(source.kind))
}
