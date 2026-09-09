import { queryOptions } from '@tanstack/react-query'
import {
  RITUAL_PROTOCOL_CAPABILITY,
  RitualClient,
  type RitualRunKind,
  type RitualRunResult,
  type RitualSchedule,
  type RitualScheduleStatus
} from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import { targetKey } from './query-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function openRitualTarget(target: RuntimeClientTarget): Promise<RitualClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(RITUAL_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new RitualClient(await openRuntimeProtocolTarget(target))
}

// Why: the ritual namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireRitualClient(target: RuntimeClientTarget): Promise<RitualClient> {
  const client = await openRitualTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.ritualTarget.unavailable',
        'Automations need a current Yiru daemon connection.'
      )
    )
  }
  return client
}

export async function fetchRitualSchedule(
  target: RuntimeClientTarget
): Promise<RitualScheduleStatus> {
  return (await requireRitualClient(target)).getSchedule()
}

export async function saveRitualSchedule(
  target: RuntimeClientTarget,
  schedule: RitualSchedule
): Promise<RitualScheduleStatus> {
  return (await requireRitualClient(target)).setSchedule(schedule)
}

export async function runRitual(
  target: RuntimeClientTarget,
  kind: RitualRunKind
): Promise<RitualRunResult> {
  return (await requireRitualClient(target)).run(kind)
}

// Why: Reads and invalidations must use the same execution-target scope.
export function ritualScheduleQuery(target: RuntimeClientTarget) {
  return queryOptions({
    queryKey: ['ritual', 'schedule', targetKey(target)] as const,
    queryFn: () => fetchRitualSchedule(target)
  })
}
