import {
  REPO_PROTOCOL_CAPABILITY,
  REPO_REFS_PROTOCOL_CAPABILITY,
  RepoClient,
  type RepoAddInput
} from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function openRepoProtocolTarget(
  target: RuntimeClientTarget
): Promise<RepoClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(REPO_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new RepoClient(await openRuntimeProtocolTarget(target))
}

// Why: the repository namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireRepoProtocolClient(target: RuntimeClientTarget): Promise<RepoClient> {
  const client = await openRepoProtocolTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.repoProtocolTarget.unavailable',
        'This action needs a current Yiru daemon connection.'
      )
    )
  }
  return client
}

// Why: the refs methods ship behind their own capability so an older daemon
// that already serves the catalog can be detected per surface, and a missing
// capability is an error, not a legacy retry.
export async function requireRepoRefsProtocolClient(
  target: RuntimeClientTarget
): Promise<RepoClient> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(REPO_REFS_PROTOCOL_CAPABILITY)) {
    throw new Error(
      translate(
        'runtime.repoProtocolTarget.unavailable',
        'This action needs a current Yiru daemon connection.'
      )
    )
  }
  return new RepoClient(await openRuntimeProtocolTarget(target))
}

export async function listRuntimeRepos(target: RuntimeClientTarget) {
  return (await requireRepoProtocolClient(target)).list({ timeoutMs: 15_000 })
}

export async function addRuntimeRepo(target: RuntimeClientTarget, input: RepoAddInput) {
  return (await requireRepoProtocolClient(target)).add(input, { timeoutMs: 15_000 })
}
