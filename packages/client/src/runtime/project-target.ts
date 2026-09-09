import { queryOptions } from '@tanstack/react-query'
import {
  PROJECT_PROTOCOL_CAPABILITY,
  ProjectClient,
  type ProjectListResult,
  type ProjectUpdateResult
} from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import { targetKey } from './query-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function openProjectTarget(
  target: RuntimeClientTarget
): Promise<ProjectClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(PROJECT_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ProjectClient(await openRuntimeProtocolTarget(target))
}

// Why: the project namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireProjectClient(target: RuntimeClientTarget): Promise<ProjectClient> {
  const client = await openProjectTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.projectTarget.unavailable',
        'This action needs a current Yiru daemon connection.'
      )
    )
  }
  return client
}

export async function listRuntimeProjects(target: RuntimeClientTarget): Promise<ProjectListResult> {
  return (await requireProjectClient(target)).list({ timeoutMs: 15_000 })
}

export async function updateRuntimeProject(
  target: RuntimeClientTarget,
  input: Parameters<ProjectClient['update']>[0]
): Promise<ProjectUpdateResult> {
  return (await requireProjectClient(target)).update(input, { timeoutMs: 15_000 })
}

export function projectCatalogProjectsQuery(target: RuntimeClientTarget) {
  return queryOptions({
    queryKey: ['project-catalog', 'projects', targetKey(target)] as const,
    queryFn: () => listRuntimeProjects(target)
  })
}

export function projectCatalogProjectsQueryKey(target: RuntimeClientTarget) {
  return projectCatalogProjectsQuery(target).queryKey
}
