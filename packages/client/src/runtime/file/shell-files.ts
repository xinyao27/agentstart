import type { LocalDownloadClient } from '@agentstart/protocol'

import { openConfiguredBrowserHostLocalDownloads } from '../browser-host-runtime'
import { requireShellFilesTarget } from '../shell-files-target'

const DOWNLOAD_CHUNK_BYTES = 384 * 1024
const BASE64_CHUNK_CHARACTERS = (DOWNLOAD_CHUNK_BYTES / 3) * 4
const UTF8_CHUNK_CODE_UNITS = DOWNLOAD_CHUNK_BYTES / 3

type DownloadSession = {
  destinationPath: string
  transferId: string
}

type DownloadResult = {
  destinationPath: string
}

type DownloadMutationResult = { ok: true }

function base64Bytes(content: string): Uint8Array<ArrayBuffer> {
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function appendBase64(
  client: LocalDownloadClient,
  transferId: string,
  content: string
): Promise<void> {
  for (let offset = 0; offset < content.length; offset += BASE64_CHUNK_CHARACTERS) {
    await client.appendFileChunk({
      transferId,
      content: base64Bytes(content.slice(offset, offset + BASE64_CHUNK_CHARACTERS))
    })
  }
}

async function appendUtf8(
  client: LocalDownloadClient,
  transferId: string,
  content: string
): Promise<void> {
  const encoder = new TextEncoder()
  let offset = 0
  while (offset < content.length) {
    let end = Math.min(content.length, offset + UTF8_CHUNK_CODE_UNITS)
    const finalCodeUnit = content.charCodeAt(end - 1)
    if (end < content.length && finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
      end -= 1
    }
    await client.appendFileChunk({
      transferId,
      content: encoder.encode(content.slice(offset, end))
    })
    offset = end
  }
}

async function saveDownloadedFile(input: {
  suggestedName: string
  content: string
  encoding: 'utf8' | 'base64'
}): Promise<DownloadResult> {
  const client = await openConfiguredBrowserHostLocalDownloads()
  const session = await client.startFile({ suggestedName: input.suggestedName })
  try {
    await (input.encoding === 'base64'
      ? appendBase64(client, session.transferId, input.content)
      : appendUtf8(client, session.transferId, input.content))
    return {
      destinationPath: await client.finishFile(session.transferId)
    }
  } catch (error) {
    await client.cancelFile(session.transferId).catch(() => {})
    throw error
  }
}

async function startDownloadedFile(input: { suggestedName: string }): Promise<DownloadSession> {
  const client = await openConfiguredBrowserHostLocalDownloads()
  const session = await client.startFile(input)
  return session
}

async function startDownloadedFolder(input: { suggestedName: string }): Promise<DownloadSession> {
  const client = await openConfiguredBrowserHostLocalDownloads()
  const session = await client.startFolder(input)
  return session
}

// Why: this facade keeps absolute, renderer-authorized path operations visibly
// separate from target-aware `files.*`. Every method fixes its destination to
// the daemon host serving the current Chrome client.
export const shellFilesClient = {
  readFile: async (args: {
    filePath: string
    connectionId?: string
    includeLocalLogMetadata?: boolean
  }) => {
    const client = await requireShellFilesTarget()
    return client.read(args.filePath, args.includeLocalLogMetadata ?? false)
  },
  readFileChunk: async (args: { filePath: string; offset: number; length: number }) => {
    const client = await requireShellFilesTarget()
    return client.readChunk(args)
  },
  saveDownloadedFile,
  startDownloadedFile,
  appendDownloadedFileChunk: async (input: {
    transferId: string
    contentBase64: string
  }): Promise<DownloadMutationResult> => {
    const client = await openConfiguredBrowserHostLocalDownloads()
    await client.appendFileChunk({
      transferId: input.transferId,
      content: base64Bytes(input.contentBase64)
    })
    return { ok: true }
  },
  finishDownloadedFile: async (input: { transferId: string }): Promise<DownloadResult> => {
    const client = await openConfiguredBrowserHostLocalDownloads()
    return {
      destinationPath: await client.finishFile(input.transferId)
    }
  },
  cancelDownloadedFile: async (input: { transferId: string }): Promise<DownloadMutationResult> => {
    const client = await openConfiguredBrowserHostLocalDownloads()
    await client.cancelFile(input.transferId)
    return { ok: true }
  },
  startDownloadedFolder,
  createDownloadedFolderDirectory: async (input: {
    transferId: string
    pathSegments: string[]
  }): Promise<DownloadMutationResult> => {
    const client = await openConfiguredBrowserHostLocalDownloads()
    await client.createFolderDirectory(input)
    return { ok: true }
  },
  appendDownloadedFolderFileChunk: (input: {
    transferId: string
    pathSegments: string[]
    contentBase64: string
    first: boolean
    last: boolean
  }): Promise<DownloadMutationResult> =>
    openConfiguredBrowserHostLocalDownloads().then(async (client) => {
      await client.appendFolderFileChunk({
        transferId: input.transferId,
        pathSegments: input.pathSegments,
        content: base64Bytes(input.contentBase64),
        first: input.first,
        last: input.last
      })
      return { ok: true }
    }),
  finishDownloadedFolder: async (input: { transferId: string }): Promise<DownloadResult> => {
    const client = await openConfiguredBrowserHostLocalDownloads()
    return {
      destinationPath: await client.finishFolder(input.transferId)
    }
  },
  cancelDownloadedFolder: async (input: {
    transferId: string
  }): Promise<DownloadMutationResult> => {
    const client = await openConfiguredBrowserHostLocalDownloads()
    await client.cancelFolder(input.transferId)
    return { ok: true }
  },
  writeFile: async (args: { filePath: string; content: string; connectionId?: string }) => {
    const client = await requireShellFilesTarget()
    await client.write(args.filePath, args.content)
  },
  createFile: async (args: { filePath: string; connectionId?: string }) => {
    const client = await requireShellFilesTarget()
    await client.createFile(args.filePath)
  },
  createDir: async (args: { dirPath: string; connectionId?: string }) => {
    const client = await requireShellFilesTarget()
    await client.createDirectory(args.dirPath)
  },
  rename: async (args: { oldPath: string; newPath: string; connectionId?: string }) => {
    const client = await requireShellFilesTarget()
    await client.rename(args.oldPath, args.newPath)
  },
  copy: async (args: { sourcePath: string; destinationPath: string; connectionId?: string }) => {
    const client = await requireShellFilesTarget()
    await client.copy(args.sourcePath, args.destinationPath)
  },
  deletePath: async (args: { targetPath: string; connectionId?: string; recursive?: boolean }) => {
    const client = await requireShellFilesTarget()
    await client.delete(args.targetPath, args.recursive ?? false)
  },
  authorizeExternalPath: async (input: { targetPath: string }) => {
    const client = await requireShellFilesTarget()
    await client.authorizeExternalPath(input.targetPath)
  },
  stat: async (args: { filePath: string; connectionId?: string }) => {
    const client = await requireShellFilesTarget()
    return client.stat(args.filePath)
  },
  pathExists: async (args: { filePath: string; connectionId?: string }) => {
    const client = await requireShellFilesTarget()
    return client.pathExists(args.filePath)
  },
  stageExternalPathsForRuntimeUpload: async (input: { sourcePaths: string[] }) => {
    const client = await requireShellFilesTarget()
    return client.stageExternalPathsForRuntimeUpload(input.sourcePaths)
  },
  resolveDroppedPathsForAgent: async (args: {
    paths: string[]
    worktreePath: string
    connectionId?: string
  }) => {
    const client = await requireShellFilesTarget()
    return client.resolveDroppedPathsForAgent(args.paths, args.worktreePath)
  }
}
