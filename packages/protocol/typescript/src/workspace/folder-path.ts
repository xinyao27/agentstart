import type {
  FolderWorkspacePathStatusValue,
  FolderWorkspacePathStatusRequestInput
} from '../folder-workspace-values.js'
export type FolderWorkspacePathStatus = FolderWorkspacePathStatusValue
export type FolderWorkspacePathStatusReason = NonNullable<FolderWorkspacePathStatusValue['reason']>
export type FolderWorkspacePathStatusRequest = FolderWorkspacePathStatusRequestInput
export const FOLDER_WORKSPACE_PATH_STATUS_TTL_MS = 10_000

export function isConfirmedStaleFolderPathStatus(
  status: FolderWorkspacePathStatus | null | undefined
): boolean {
  return (
    status?.exists === false && (status.reason === 'missing' || status.reason === 'not-directory')
  )
}

export function blocksFolderWorkspaceActivation(
  status: FolderWorkspacePathStatus | null | undefined
): boolean {
  return isConfirmedStaleFolderPathStatus(status)
}
