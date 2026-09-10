import { parseWorkspaceKey, folderWorkspaceKey } from '@agentstart/protocol/workspace/identity'

// Why: activeWorktreeId drives the workspace surface users can see. The scoped
// key is only a fallback for legacy folder sessions that did not populate it.
export function getActiveSidebarWorkspaceId(
  activeWorkspaceKey: string | null,
  activeWorktreeId: string | null
): string | null {
  if (activeWorktreeId !== null) {
    return activeWorktreeId
  }
  const scope = activeWorkspaceKey ? parseWorkspaceKey(activeWorkspaceKey) : null
  if (scope?.type === 'folder') {
    return folderWorkspaceKey(scope.folderWorkspaceId)
  }
  return null
}
