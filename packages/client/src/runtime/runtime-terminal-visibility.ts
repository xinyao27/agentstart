import { isRuntimePtyId } from '@yiru/protocol/terminal-identity'
import { isRemoteTerminalSurfaceTabId } from '@yiru/protocol/terminal/surface-identity'
import type { AppState } from '~renderer/store/types'

export function isWebOnlyMirroredTerminalTab(
  state: Pick<AppState, 'terminalLayoutsByTabId'>,
  tab: Pick<NonNullable<AppState['tabsByWorktree'][string]>[number], 'id' | 'ptyId'>
): boolean {
  if (!isRemoteTerminalSurfaceTabId(tab.id)) {
    return false
  }
  const layoutPtyIds = Object.values(state.terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId ?? {})
  const ptyIds = [tab.ptyId, ...layoutPtyIds].filter(
    (ptyId): ptyId is string => typeof ptyId === 'string' && ptyId.length > 0
  )
  // Why: web mirror ids are a web-renderer implementation detail. If such an
  // id has only remote/no PTYs, it is a mirror and must not be published back
  // as host state. Legacy leaked host tabs with local PTYs still publish so
  // existing sessions keep desktop/web parity.
  return ptyIds.every(isRuntimePtyId)
}
