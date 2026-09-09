import type { WorkspaceSessionState } from '@yiru/protocol/workspace/session'

export function buildLastVisitedAtByWorktreeId(snapshot: {
  lastVisitedAtByWorktreeId: WorkspaceSessionState['lastVisitedAtByWorktreeId']
}): WorkspaceSessionState['lastVisitedAtByWorktreeId'] {
  return snapshot.lastVisitedAtByWorktreeId &&
    Object.keys(snapshot.lastVisitedAtByWorktreeId).length > 0
    ? snapshot.lastVisitedAtByWorktreeId
    : undefined
}
