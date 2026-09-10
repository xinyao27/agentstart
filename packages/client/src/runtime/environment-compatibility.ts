import type { RuntimeCapability } from '@agentstart/protocol/runtime-versions'
import { translate } from '~renderer/i18n/i18n'

import { assertRuntimeStatusCompatible } from './protocol-compat'
import { runtimeEnvironmentsClient } from './runtime-environments-client'
import type { RuntimeStatusResult } from './status/model'

type RuntimeEnvironmentStatus = RuntimeStatusResult

const RUNTIME_COMPATIBILITY_CACHE_MAX = 32
// Why: capability verdicts must eventually follow a saved environment's version changes.
const RUNTIME_CAPABILITY_STATUS_TTL_MS = 60_000

type RuntimeCompatibilityCacheEntry = {
  check: Promise<void>
  failedAt: number | null
  // False while probing so recovery can drop a doomed pending compatibility check.
  provenCompatible: boolean
  status: RuntimeEnvironmentStatus | null
  statusCheckedAt: number | null
}

const runtimeCompatibilityChecks = new Map<string, RuntimeCompatibilityCacheEntry>()

function rememberRuntimeEnvironmentCompatibility(
  environmentId: string,
  entry: RuntimeCompatibilityCacheEntry
): void {
  // Why: saved/removed remote runtimes can churn through unique ids in long
  // renderer sessions; compatibility cache entries should not grow forever.
  runtimeCompatibilityChecks.delete(environmentId)
  runtimeCompatibilityChecks.set(environmentId, entry)
  while (runtimeCompatibilityChecks.size > RUNTIME_COMPATIBILITY_CACHE_MAX) {
    const oldest = runtimeCompatibilityChecks.keys().next().value
    if (oldest === undefined) {
      break
    }
    runtimeCompatibilityChecks.delete(oldest)
  }
}

// Why: a live status answer invalidates failures and pending probes from the
// dropped connection; only proven-compatible successes remain reusable.
export function clearRecentRuntimeCompatibilityFailure(environmentId: string): void {
  const trimmed = environmentId.trim()
  if (!trimmed) {
    return
  }
  const cached = runtimeCompatibilityChecks.get(trimmed)
  if (cached && !cached.provenCompatible) {
    runtimeCompatibilityChecks.delete(trimmed)
  }
}

export function clearRuntimeCompatibilityCache(environmentId?: string | null): void {
  const trimmed = environmentId?.trim()
  if (trimmed) {
    runtimeCompatibilityChecks.delete(trimmed)
    return
  }
  runtimeCompatibilityChecks.clear()
}

export function markRuntimeEnvironmentCompatible(environmentId: string): void {
  const trimmed = environmentId.trim()
  if (!trimmed) {
    return
  }
  rememberRuntimeEnvironmentCompatibility(trimmed, {
    check: Promise.resolve(),
    failedAt: null,
    provenCompatible: true,
    status: null,
    statusCheckedAt: null
  })
}

export async function getRuntimeEnvironmentStatus(
  environmentId: string,
  timeoutMs?: number
): Promise<RuntimeEnvironmentStatus> {
  const trimmed = environmentId.trim()
  const entry: RuntimeCompatibilityCacheEntry = {
    check: Promise.resolve(),
    failedAt: null,
    provenCompatible: false,
    status: null,
    statusCheckedAt: null
  }
  // Why: publish the in-flight probe before awaiting so concurrent cold-cache
  // capability lookups coalesce onto this one status.get instead of duplicating probes.
  const check = (async () => {
    const status = await runtimeEnvironmentsClient.getStatus({ selector: trimmed, timeoutMs })
    assertRuntimeStatusCompatible(status)
    entry.status = status
    entry.statusCheckedAt = Date.now()
    entry.provenCompatible = true
  })()
  entry.check = check
  rememberRuntimeEnvironmentCompatibility(trimmed, entry)
  try {
    await check
  } catch (error) {
    // Why: this probe always re-fetches, so a failure must not linger as a
    // cached verdict; drop the entry so the next call re-probes cleanly.
    if (runtimeCompatibilityChecks.get(trimmed) === entry) {
      runtimeCompatibilityChecks.delete(trimmed)
    }
    throw error
  }
  if (!entry.status) {
    // Unreachable: a resolved probe always assigns status; narrows the type.
    throw new Error(
      translate('runtime.status.probeMissing', 'Runtime status probe resolved without a status.')
    )
  }
  return entry.status
}

export async function runtimeEnvironmentSupportsCapability(
  environmentId: string,
  capability: RuntimeCapability,
  timeoutMs?: number
): Promise<boolean> {
  const trimmed = environmentId.trim()
  const cached = runtimeCompatibilityChecks.get(trimmed)
  // Why: capability lookups must not pin to a rejected cache promise or they
  // block recovery even though the next ordinary RPC would re-probe successfully.
  if (cached && cached.failedAt === null) {
    try {
      await cached.check
      if (
        runtimeCompatibilityChecks.get(trimmed) === cached &&
        cached.status &&
        cached.statusCheckedAt !== null &&
        Date.now() - cached.statusCheckedAt < RUNTIME_CAPABILITY_STATUS_TTL_MS
      ) {
        const supported = cached.status.capabilities?.includes(capability) === true
        if (!supported) {
          // Why: an unsupported verdict must not survive a remote upgrade.
          runtimeCompatibilityChecks.delete(trimmed)
        }
        return supported
      }
    } catch {
      // Fall through to a fresh status.get that refreshes the cache.
    }
  }
  const status = await getRuntimeEnvironmentStatus(trimmed, timeoutMs)
  // Why: a probe removed during reconnect cannot answer for the replacement connection.
  const supported =
    runtimeCompatibilityChecks.get(trimmed)?.status === status &&
    status.capabilities?.includes(capability) === true
  if (!supported && runtimeCompatibilityChecks.get(trimmed)?.status === status) {
    runtimeCompatibilityChecks.delete(trimmed)
  }
  return supported
}

export async function assertRuntimeEnvironmentCapability(
  environmentId: string,
  capability: RuntimeCapability,
  message: string,
  timeoutMs?: number
): Promise<void> {
  const trimmed = environmentId.trim()
  const status = await getRuntimeEnvironmentStatus(trimmed, timeoutMs)
  if (
    runtimeCompatibilityChecks.get(trimmed)?.status !== status ||
    !status.capabilities?.includes(capability)
  ) {
    throw new Error(message)
  }
}
