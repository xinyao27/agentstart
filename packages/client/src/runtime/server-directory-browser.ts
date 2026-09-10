import type { DirectoryEntry as DirEntry } from '@agentstart/protocol/files/values'

import { requireFilesTarget } from './files-target'

export type RuntimeServerDirectoryListing = {
  resolvedPath: string
  entries: DirEntry[]
}

export async function browseRuntimeServerDirectory(
  environmentId: string,
  path: string
): Promise<RuntimeServerDirectoryListing> {
  const client = await requireFilesTarget({ kind: 'environment', environmentId })
  return client.browseServerDirectory(path, { timeoutMs: 15_000 })
}
