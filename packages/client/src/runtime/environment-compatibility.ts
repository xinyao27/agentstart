import type { RuntimeCapability } from '@yiru/protocol/runtime-versions'
import { translate } from '~renderer/i18n/i18n'

import { assertRuntimeStatusCompatible } from './protocol-compat'
import { runtimeEnvironmentsClient } from './runtime-environments-client'
import type { RuntimeStatusResult } from './status/model'

type RuntimeEnvironmentStatus = RuntimeStatusResult

const RUNTIME_COMPATIBILITY_CACHE_MAX = 32
const RECENT_RUNTIME_COMPATIBILITY_FAILURE_TTL_MS = 60_000
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

export async function ensureRuntimeEnvironmentCompatible(
  environmentId: string,
  options: { timeoutMs?: number; reuseRecentCompatibilityFailure?: boolean } = {}
): Promise<void> {
  const cached = getCachedRuntimeCompatibilityCheck(environmentId, options)
  if (cached) {
    await cached.check
    return
  }
  const entry: RuntimeCompatibilityCacheEntry = {
    check: Promise.resolve(),
    failedAt: null,
    provenCompatible: false,
    status: null,
    statusCheckedAt: null
  }
  const check = (async () => {
    const status = await runtimeEnvironmentsClient.getStatus({
      selector: environmentId,
      timeoutMs: options.timeoutMs
    })
    assertRuntimeStatusCompatible(status)
    entry.status = status
    entry.statusCheckedAt = Date.now()
  })()
  entry.check = check
  rememberRuntimeEnvironmentCompatibility(environmentId, entry)
  try {
    await check
    if (runtimeCompatibilityChecks.get(environmentId) === entry) {
      entry.provenCompatible = true
    }
  } catch (error) {
    if (runtimeCompatibilityChecks.get(environmentId) === entry) {
      // Why: startup asks each remote for repos, groups, then folders; an
      // offline runtime should pay one timeout during that burst, not three.
      entry.failedAt = Date.now()
    }
    throw error
  }
}

function getCachedRuntimeCompatibilityCheck(
  environmentId: string,
  options: { reuseRecentCompatibilityFailure?: boolean }
): RuntimeCompatibilityCacheEntry | null {
  const cached = runtimeCompatibilityChecks.get(environmentId)
  if (!cached) {
    return null
  }
  if (
    cached.failedAt !== null &&
    Date.now() - cached.failedAt >= RECENT_RUNTIME_COMPATIBILITY_FAILURE_TTL_MS
  ) {
    runtimeCompatibilityChecks.delete(environmentId)
    return null
  }
  if (cached.failedAt !== null && options.reuseRecentCompatibilityFailure !== true) {
    return null
  }
  runtimeCompatibilityChecks.delete(environmentId)
  runtimeCompatibilityChecks.set(environmentId, cached)
  return cached
}

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
