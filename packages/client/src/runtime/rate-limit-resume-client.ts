import type {
  CodexUsageLimitProbe,
  RateLimitHit,
  RateLimitResumeSchedule
} from '@agentstart/protocol'

import { openRateLimitResumeTarget } from './rate-limit-resume-target'

export async function inspectCodexUsageLimit(
  probe: CodexUsageLimitProbe
): Promise<RateLimitHit | null> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.inspectCodex(probe)
}

export async function listRateLimitResumes(): Promise<RateLimitResumeSchedule[]> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.list()
}

export async function scheduleRuntimeRateLimitResume(
  hit: RateLimitHit
): Promise<RateLimitResumeSchedule> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.schedule(hit)
}

export async function cancelRuntimeRateLimitResume(id: string): Promise<RateLimitResumeSchedule> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.cancel(id)
}

export async function runRuntimeRateLimitResumeNow(id: string): Promise<RateLimitResumeSchedule> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.runNow(id)
}

export async function markRateLimitResumeFired(id: string): Promise<RateLimitResumeSchedule> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.markFired(id)
}

export async function markRateLimitResumeFailed(
  id: string,
  reason: string
): Promise<RateLimitResumeSchedule> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.markFailed(id, reason)
}

export async function markRateLimitResumeStale(id: string): Promise<RateLimitResumeSchedule> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.markStale(id)
}

export async function notifyRateLimitResumeRendererReady(): Promise<void> {
  const client = await openRateLimitResumeTarget()
  if (!client) {
    throw new Error('Rate limit resume service unavailable')
  }
  return client.rendererReady()
}
