import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'

import { matchesRepoCacheKey, repoCacheKeyPrefixes } from './cache-policy'
import type { GitHubWorkItemRequestTarget } from './work-items-request'

const FETCH_CONCURRENCY = 8

type InflightRequest = {
  promise: Promise<GitHubWorkItem[]>
  force: boolean
  noCache: boolean
  token: object
}

type ExecuteWorkItemRequest = {
  cacheKey: string
  target: GitHubWorkItemRequestTarget
  force: boolean
  noCache: boolean
  load: () => Promise<GitHubWorkItem[]>
}

const inflightRequests = new Map<string, InflightRequest>()
const waiters: (() => void)[] = []
let fetchesInFlight = 0

function requestKey(cacheKey: string, target: GitHubWorkItemRequestTarget): string {
  const targetPart =
    target.kind === 'environment' ? `env:${target.environmentId}:${target.runtimeRepoId}` : 'local'
  return `${cacheKey}::${targetPart}`
}

async function acquireSlot(): Promise<void> {
  if (fetchesInFlight < FETCH_CONCURRENCY) {
    fetchesInFlight += 1
    return
  }
  await new Promise<void>((resolve) => waiters.push(resolve))
}

function releaseSlot(): void {
  const next = waiters.shift()
  if (next) {
    next()
  } else {
    fetchesInFlight -= 1
  }
}

export const workItemRequests = {
  async execute(options: ExecuteWorkItemRequest): Promise<GitHubWorkItem[]> {
    const key = requestKey(options.cacheKey, options.target)
    const existing = inflightRequests.get(key)
    if (existing) {
      if ((options.force && !existing.force) || (options.noCache && !existing.noCache)) {
        await existing.promise.catch(() => {})
      } else {
        return existing.promise
      }
    }
    const token = {}
    const request = (async () => {
      await acquireSlot()
      try {
        return await options.load()
      } finally {
        releaseSlot()
        if (inflightRequests.get(key)?.token === token) {
          inflightRequests.delete(key)
        }
      }
    })()
    inflightRequests.set(key, {
      promise: request,
      force: options.force,
      noCache: options.noCache,
      token
    })
    return request
  },
  has(cacheKey: string, target: GitHubWorkItemRequestTarget): boolean {
    return inflightRequests.has(requestKey(cacheKey, target))
  },
  clearRepo(repoId: string, repoPath?: string): void {
    const prefixes = repoCacheKeyPrefixes(repoId, repoPath)
    for (const key of inflightRequests.keys()) {
      if (matchesRepoCacheKey(key, prefixes)) {
        inflightRequests.delete(key)
      }
    }
  }
}
