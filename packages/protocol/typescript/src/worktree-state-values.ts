import { WorktreeBaseStatusKind } from '../generated/yiru/runtime/v1/worktree_pb.js'
import type { WorktreeServiceSubscribeStateEventsResponse } from '../generated/yiru/runtime/v1/worktree_pb.js'
import type { WorktreeStateSubscriptionEvent } from './worktree-operation-types.js'

export function worktreeStateSubscriptionEvent(
  value: WorktreeServiceSubscribeStateEventsResponse
): WorktreeStateSubscriptionEvent {
  switch (value.event.case) {
    case 'ready':
      return {
        type: 'ready',
        subscriptionId: required(value.event.value.subscriptionId, 'Subscription ID')
      }
    case 'baseStatus': {
      const event = value.event.value
      return {
        type: 'baseStatus',
        repoId: required(event.repoId, 'Base status repository ID'),
        worktreeId: required(event.worktreeId, 'Base status worktree ID'),
        status: oneOfEnum(
          event.status,
          {
            [WorktreeBaseStatusKind.CHECKING]: 'checking',
            [WorktreeBaseStatusKind.CURRENT]: 'current',
            [WorktreeBaseStatusKind.DRIFT]: 'drift',
            [WorktreeBaseStatusKind.BASE_CHANGED]: 'base_changed',
            [WorktreeBaseStatusKind.UNKNOWN]: 'unknown'
          } as const,
          'Base status kind'
        ),
        base: event.base,
        ...(event.behind === undefined ? {} : { behind: safeInteger(event.behind) })
      }
    }
    case undefined:
      throw new TypeError('Worktree state event is empty')
  }
}

function oneOfEnum<const T extends string>(
  value: number,
  mapping: Partial<Record<number, T>>,
  label: string
): T {
  const mapped = mapping[value]
  if (mapped === undefined) {
    throw new TypeError(`${label} is invalid`)
  }
  return mapped
}

function safeInteger(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new TypeError('Worktree response integer is unsafe')
  }
  return number
}

function required(value: string, label: string): string {
  if (!value) {
    throw new TypeError(`${label} is missing`)
  }
  return value
}
