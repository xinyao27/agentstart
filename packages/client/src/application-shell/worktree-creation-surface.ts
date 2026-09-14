export type WorktreeCreationSurfaceInput = {
  workspaceBodyVisible: boolean
  activePendingCreationId: string | null
  hasActivePendingCreation: boolean
}

export function shouldShowWorktreeCreationSurface({
  workspaceBodyVisible,
  activePendingCreationId,
  hasActivePendingCreation
}: WorktreeCreationSurfaceInput): boolean {
  return workspaceBodyVisible && activePendingCreationId !== null && hasActivePendingCreation
}
