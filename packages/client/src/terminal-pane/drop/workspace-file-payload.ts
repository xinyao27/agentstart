import { WORKSPACE_FILE_PATH_MIME, WORKSPACE_FILE_PATHS_MIME } from '~renderer/workspace/file-drag'

/** True when a drag carries workspace file paths, single or multiple. */
export function carriesWorkspaceFilePaths(dataTransfer: Pick<DataTransfer, 'types'>): boolean {
  return (
    dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME) ||
    dataTransfer.types.includes(WORKSPACE_FILE_PATHS_MIME)
  )
}
