import type { TerminalPaneSplitSource } from '@agentstart/protocol/telemetry/education'
import { splitRemoteRuntimeTerminal } from '~renderer/runtime/remote-runtime-session'
import type { ManagedPane, PaneManager } from '~renderer/terminal-pane/pane-manager/pane-manager'

import type { PtyTransport } from './pty/transport-types'
import { resolveSplitCwd, type PaneCwdMap } from './resolve-split-cwd'
import { recordCreatedTerminalPaneSplit } from './split-completion'

export function splitTerminalPaneWithInheritedCwd(args: {
  manager: PaneManager
  getManager?: () => PaneManager | null
  paneTransports: Map<number, PtyTransport>
  paneCwdMap: PaneCwdMap
  fallbackCwd: string
  pane: ManagedPane
  direction: 'vertical' | 'horizontal'
  source: TerminalPaneSplitSource
}): void {
  const ptyId = args.paneTransports.get(args.pane.id)?.getPtyId() ?? null
  if (splitRemoteRuntimeTerminal(ptyId, args.direction, args.source)) {
    return
  }
  const cached = args.paneCwdMap.get(args.pane.id)
  if (cached?.confirmed && cached.cwd) {
    const createdPane = args.manager.splitPane(args.pane.id, args.direction, { cwd: cached.cwd })
    recordCreatedTerminalPaneSplit(createdPane, {
      source: args.source,
      direction: args.direction
    })
    return
  }
  const paneId = args.pane.id
  const resolveManager = (): PaneManager | null =>
    args.getManager ? args.getManager() : args.manager
  void (async () => {
    const cwd = await resolveSplitCwd({
      paneCwdMap: args.paneCwdMap,
      sourcePaneId: paneId,
      sourcePtyId: ptyId,
      fallbackCwd: args.fallbackCwd
    })
    const createdPane = resolveManager()?.splitPane(paneId, args.direction, { cwd })
    recordCreatedTerminalPaneSplit(createdPane, {
      source: args.source,
      direction: args.direction
    })
  })()
}
