import { FILES_PROTOCOL_CAPABILITY, FilesClient } from '@agentstart/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

// Why: files operate on a worktree that may live on a remote environment (WSL/SSH), unlike
// the local-only capabilities `terminal-fit-target.ts` gates — so this follows
// `workspace-events-target.ts`'s target-aware shape instead.
export async function openFilesTarget(target: RuntimeClientTarget): Promise<FilesClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(FILES_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new FilesClient(await openRuntimeProtocolTarget(target))
}

// Why: the files namespace has no legacy fallback left to drop into, so every call site
// requires the capability outright instead of silently degrading.
export async function requireFilesTarget(target: RuntimeClientTarget): Promise<FilesClient> {
  const client = await openFilesTarget(target)
  if (!client) {
    throw new Error('files.protobuf.v1 capability is not available on this runtime host')
  }
  return client
}
