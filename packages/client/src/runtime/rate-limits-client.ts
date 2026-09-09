import {
  AccountsClient,
  type CodexRateLimitResetResult,
  type CursorRateLimitRefreshContext,
  type RateLimitRuntimeTarget,
  type RateLimitState
} from '@yiru/protocol'
import { parseExecutionHostId } from '@yiru/protocol/host/identity'
import { useAppStore } from '~renderer/store/state'

import { openRuntimeProtocolTarget } from './protocol-target'
import { getActiveRuntimeTarget, type RuntimeClientTarget } from './rpc-client'

const RATE_LIMIT_SNAPSHOT_TIMEOUT_MS = 15_000

export function getRateLimitsTarget(): RuntimeClientTarget {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

async function client(
  target: RuntimeClientTarget = getRateLimitsTarget()
): Promise<AccountsClient> {
  return new AccountsClient(await openRuntimeProtocolTarget(target))
}

function cursorRefreshRoute(context: CursorRateLimitRefreshContext): {
  context: CursorRateLimitRefreshContext
  target: RuntimeClientTarget
} {
  const host = parseExecutionHostId(context.executionHostId)
  if (host?.kind !== 'runtime') {
    return { context, target: { kind: 'local' } }
  }
  return {
    context: { ...context, executionHostId: 'local' },
    target: { kind: 'environment', environmentId: host.environmentId }
  }
}

export async function fetchRateLimitSnapshot(): Promise<RateLimitState> {
  const controller = new AbortController()
  let cancel: ((reason?: string) => Promise<void>) | undefined
  try {
    const subscription = await (
      await client()
    ).subscribe({ signal: controller.signal, timeoutMs: RATE_LIMIT_SNAPSHOT_TIMEOUT_MS })
    cancel = subscription.cancel
    for await (const event of subscription.events) {
      if (event.type === 'ready' || event.type === 'snapshot') {
        return event.snapshot.rateLimits
      }
      if (event.type === 'end') {
        break
      }
    }
    throw new Error('Rate-limit snapshot stream closed before its first snapshot.')
  } finally {
    controller.abort()
    await cancel?.('Rate-limit snapshot received')
  }
}

export async function refreshRateLimitSnapshot(
  cursorContext?: CursorRateLimitRefreshContext
): Promise<RateLimitState> {
  if (!cursorContext) {
    return (await client()).refreshRateLimits()
  }
  const route = cursorRefreshRoute(cursorContext)
  return (await client(route.target)).refreshRateLimits(route.context)
}

export async function refreshClaudeRateLimitTarget(
  target: RateLimitRuntimeTarget
): Promise<RateLimitState> {
  return (await client()).refreshClaudeRateLimits(target)
}

export async function refreshCodexRateLimitTarget(
  target: RateLimitRuntimeTarget
): Promise<RateLimitState> {
  return (await client()).refreshCodexRateLimits(target)
}

export async function consumeCodexRateLimitResetCredit(): Promise<CodexRateLimitResetResult> {
  return (await client()).consumeCodexResetCredit()
}

export async function fetchInactiveClaudeRateLimitAccounts(): Promise<void> {
  await (await client()).refreshInactiveClaude()
}

export async function fetchInactiveCodexRateLimitAccounts(): Promise<void> {
  await (await client()).refreshInactiveCodex()
}

export async function refreshGrokRateLimitSnapshot(): Promise<RateLimitState> {
  return (await client()).refreshGrokRateLimits()
}
