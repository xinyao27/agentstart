import type { DirectoryEntry as DirEntry } from '@yiru/protocol/files/values'
import { isWindowsAbsolutePathLike, normalizeRuntimePathSeparators } from '@yiru/protocol/host/path'

import {
  readRuntimeDirectory,
  streamRuntimeFileDownloadChunks,
  type RuntimeFileDownloadResult,
  type RuntimeFileOperationArgs
} from './file-client'
import { shellFilesClient } from './file/shell-files'

function validateRemoteEntryName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid remote directory entry '${name}'`)
  }
}

async function downloadRuntimeDirectoryTree(
  context: RuntimeFileOperationArgs,
  remoteDirectoryPath: string,
  localPathSegments: string[],
  transferId: string,
  windowsRemotePaths: boolean
): Promise<void> {
  const entries = await readRuntimeDirectory(context, remoteDirectoryPath)
  const plannedEntries = [...entries]
  plannedEntries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of plannedEntries) {
    validateRemoteEntryName(entry.name)
    if (entry.isSymlink) {
      // Why: following a runtime-reported link could leave the selected tree.
      throw new Error(`Cannot download symbolic link '${entry.name}'`)
    }
    await downloadRuntimeEntry(
      context,
      remoteDirectoryPath,
      localPathSegments,
      transferId,
      windowsRemotePaths,
      entry
    )
  }
}

async function downloadRuntimeEntry(
  context: RuntimeFileOperationArgs,
  remoteDirectoryPath: string,
  localPathSegments: string[],
  transferId: string,
  windowsRemotePaths: boolean,
  entry: DirEntry
): Promise<void> {
  const normalizedDirectory = windowsRemotePaths
    ? normalizeRuntimePathSeparators(remoteDirectoryPath)
    : remoteDirectoryPath
  const remotePath = `${normalizedDirectory.replace(/\/+$/g, '')}/${entry.name}`
  const pathSegments = [...localPathSegments, entry.name]
  if (entry.isDirectory) {
    await shellFilesClient.createDownloadedFolderDirectory({ transferId, pathSegments })
    await downloadRuntimeDirectoryTree(
      context,
      remotePath,
      pathSegments,
      transferId,
      windowsRemotePaths
    )
    return
  }
  await streamRuntimeFileDownloadChunks(context, remotePath, async (chunk) => {
    await shellFilesClient.appendDownloadedFolderFileChunk({
      transferId,
      pathSegments,
      contentBase64: chunk.contentBase64,
      first: chunk.first,
      last: chunk.last
    })
  })
}

export async function downloadRuntimeFolder(
  context: RuntimeFileOperationArgs,
  dirPath: string,
  suggestedName: string
): Promise<RuntimeFileDownloadResult> {
  const download = await shellFilesClient.startDownloadedFolder({ suggestedName })
  let finished = false
  try {
    await downloadRuntimeDirectoryTree(
      context,
      dirPath,
      [],
      download.transferId,
      isWindowsAbsolutePathLike(dirPath)
    )
    const result = await shellFilesClient.finishDownloadedFolder({
      transferId: download.transferId
    })
    finished = true
    return result
  } finally {
    if (!finished) {
      await shellFilesClient
        .cancelDownloadedFolder({ transferId: download.transferId })
        .catch(() => {})
    }
  }
}
