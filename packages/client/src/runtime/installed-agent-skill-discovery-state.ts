import type { SkillDiscoveryResult } from '@agentstart/protocol'

export const INSTALLED_AGENT_SKILLS_CHANGED_EVENT = 'agentstart:installed-agent-skills-changed'

const INSTALLED_AGENT_SKILL_DISCOVERY_CACHE_MAX = 256

const cachedDiscoveryByTarget = new Map<string, SkillDiscoveryResult>()
export const pendingDiscoveryByTarget = new Map<string, Promise<SkillDiscoveryResult>>()
export const pendingDiscoverySatisfiesForcedRefreshByTarget = new Map<string, boolean>()
let discoveryGeneration = 0

// Why: render reads must not reorder LRU recency because React can discard a render pass.
export function peekInstalledAgentSkillDiscovery(key: string): SkillDiscoveryResult | null {
  return cachedDiscoveryByTarget.get(key) ?? null
}

export function readInstalledAgentSkillDiscovery(key: string): SkillDiscoveryResult | null {
  const result = cachedDiscoveryByTarget.get(key)
  if (!result) {
    return null
  }
  cachedDiscoveryByTarget.delete(key)
  cachedDiscoveryByTarget.set(key, result)
  return result
}

export function writeInstalledAgentSkillDiscovery(
  key: string,
  result: SkillDiscoveryResult,
  generation: number
): void {
  if (generation !== discoveryGeneration) {
    return
  }
  cachedDiscoveryByTarget.delete(key)
  cachedDiscoveryByTarget.set(key, result)
  while (cachedDiscoveryByTarget.size > INSTALLED_AGENT_SKILL_DISCOVERY_CACHE_MAX) {
    const oldestKey = cachedDiscoveryByTarget.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    cachedDiscoveryByTarget.delete(oldestKey)
  }
}

export function getInstalledAgentSkillDiscoveryGeneration(): number {
  return discoveryGeneration
}

function invalidateInstalledAgentSkillDiscovery(): void {
  discoveryGeneration += 1
  cachedDiscoveryByTarget.clear()
  // Why: installs must start a post-mutation scan; an older pending read may finish,
  // but its generation must not repopulate the cache with stale disk state.
  pendingDiscoveryByTarget.clear()
  pendingDiscoverySatisfiesForcedRefreshByTarget.clear()
}

export function notifyInstalledAgentSkillsChanged(): void {
  invalidateInstalledAgentSkillDiscovery()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INSTALLED_AGENT_SKILLS_CHANGED_EVENT))
  }
}
