import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { isLocalPathOpenBlocked } from '~renderer/editor/local-path-open-guard'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'

export function shouldBlockEditorTabLocalOpen(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  fileRuntimeEnvironmentId: string | null | undefined,
  connectionId: string | null | undefined
): boolean {
  return isLocalPathOpenBlocked(settingsForRuntimeOwner(settings, fileRuntimeEnvironmentId), {
    connectionId
  })
}
