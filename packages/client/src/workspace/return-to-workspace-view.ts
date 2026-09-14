import { useAppStore } from '../store/state'

// Why: top-level pages keep the workspace strip mounted in the shared titlebar,
// so acting on a workspace surface from that strip must also leave the page
// view — otherwise the action would target a hidden workspace body. Delegates to
// the store so the move lands on a real tab instead of only moving the mirror.
export function returnToWorkspaceView(): void {
  useAppStore.getState().focusWorkspaceSurface()
}
