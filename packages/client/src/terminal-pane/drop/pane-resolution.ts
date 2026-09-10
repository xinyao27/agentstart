import type { ManagedPane, PaneManager } from '~renderer/terminal-pane/pane-manager/pane-manager'

export function resolveInternalTerminalDropPane(
  manager: PaneManager,
  dropTarget: EventTarget | null | undefined
): ManagedPane | null {
  const panes = manager.getPanes()
  if (dropTarget) {
    const targetedPane = panes.find((pane) => paneContainsDropTarget(pane, dropTarget))
    if (targetedPane) {
      return targetedPane
    }
  }
  return manager.getActivePane() ?? panes[0] ?? null
}

function paneContainsDropTarget(pane: ManagedPane, dropTarget: EventTarget): boolean {
  try {
    // Why: synthetic drag targets are not always DOM Nodes, but browser drops are.
    return pane.container.contains(dropTarget as Node)
  } catch {
    return false
  }
}
