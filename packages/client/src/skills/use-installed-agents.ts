import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DiscoveredSkill, SkillDiscoveryResult, SkillSourceKind } from '@yiru/protocol'
import { useEffect } from 'react'
import {
  getInstalledAgentSkillDiscoveryGeneration,
  INSTALLED_AGENT_SKILLS_CHANGED_EVENT,
  peekInstalledAgentSkillDiscovery,
  pendingDiscoveryByTarget,
  pendingDiscoverySatisfiesForcedRefreshByTarget,
  readInstalledAgentSkillDiscovery,
  writeInstalledAgentSkillDiscovery
} from '~renderer/runtime/installed-agent-skill-discovery-state'
import { discoverSkills } from '~renderer/runtime/skill-manage-client'
import type { SkillDiscoveryTarget } from '~renderer/skills/discovery-target'
import { markOrchestrationSetupComplete } from '~renderer/skills/orchestration-setup-state'

import { useEventCallback } from '../react/use-event-callback'
import {
  hasInstalledAgentSkillNamed,
  isOrchestrationSkillName,
  normalizeInstalledSkillName
} from './installed-agent-skill-match'

export { hasInstalledAgentSkill, hasInstalledAgentSkillNamed } from './installed-agent-skill-match'

export const GLOBAL_AGENT_SKILL_SOURCE_KINDS = [
  'home'
] as const satisfies readonly SkillSourceKind[]

type InstalledAgentSkillOptions = {
  enabled?: boolean
  discoveryTarget?: SkillDiscoveryTarget
  sourceKinds?: readonly SkillSourceKind[]
}

export type InstalledAgentSkillState = {
  installed: boolean
  loading: boolean
  error: string | null
  skills: readonly DiscoveredSkill[]
  refresh: () => Promise<boolean>
}

function normalizeSkillDiscoveryTarget(
  target: SkillDiscoveryTarget | undefined
): SkillDiscoveryTarget | undefined {
  const projectRuntime = target?.projectRuntime
  if (projectRuntime) {
    if (projectRuntime.status === 'repair-required') {
      return { projectRuntime }
    }
    if (projectRuntime.runtime.kind === 'wsl') {
      return {
        runtime: 'wsl',
        wslDistro: projectRuntime.runtime.distro,
        projectRuntime
      }
    }
    return {
      runtime: 'host',
      projectRuntime
    }
  }

  if (target?.runtime !== 'wsl') {
    return undefined
  }
  return { runtime: 'wsl', wslDistro: target.wslDistro?.trim() || null }
}

function getSkillDiscoveryTargetKey(target: SkillDiscoveryTarget | undefined): string {
  if (target?.projectRuntime) {
    return target.projectRuntime.status === 'resolved'
      ? target.projectRuntime.runtime.cacheKey
      : target.projectRuntime.repair.cacheKey
  }
  const normalizedTarget = normalizeSkillDiscoveryTarget(target)
  return normalizedTarget?.runtime === 'wsl' ? `wsl:${normalizedTarget.wslDistro ?? ''}` : 'host'
}

function startInstalledAgentSkillDiscovery(
  force: boolean,
  target: SkillDiscoveryTarget | undefined
): Promise<SkillDiscoveryResult> {
  const key = getSkillDiscoveryTargetKey(target)
  const generation = getInstalledAgentSkillDiscoveryGeneration()
  const normalizedTarget = normalizeSkillDiscoveryTarget(target)
  const discovery = discoverSkills(normalizedTarget)
    .then((result) => {
      writeInstalledAgentSkillDiscovery(key, result, generation)
      return result
    })
    .finally(() => {
      if (pendingDiscoveryByTarget.get(key) === discovery) {
        pendingDiscoveryByTarget.delete(key)
        pendingDiscoverySatisfiesForcedRefreshByTarget.delete(key)
      }
    })
  pendingDiscoveryByTarget.set(key, discovery)
  pendingDiscoverySatisfiesForcedRefreshByTarget.set(key, force)
  return discovery
}

async function discoverInstalledAgentSkills(
  force: boolean,
  target?: SkillDiscoveryTarget
): Promise<SkillDiscoveryResult> {
  const key = getSkillDiscoveryTargetKey(target)
  if (!force) {
    const cachedDiscovery = readInstalledAgentSkillDiscovery(key)
    if (cachedDiscovery) {
      return cachedDiscovery
    }
  }

  const inFlightDiscovery = pendingDiscoveryByTarget.get(key)
  if (inFlightDiscovery) {
    if (!force || pendingDiscoverySatisfiesForcedRefreshByTarget.get(key)) {
      return inFlightDiscovery
    }
    try {
      await inFlightDiscovery
    } catch {
      // Why: an explicit re-check should still read current disk state even if
      // the older background scan failed.
    }
    const nextPendingDiscovery = pendingDiscoveryByTarget.get(key)
    if (nextPendingDiscovery && nextPendingDiscovery !== inFlightDiscovery) {
      return nextPendingDiscovery
    }
  }

  return startInstalledAgentSkillDiscovery(force, target)
}

export function useInstalledAgentSkill(
  skillName: string,
  options: InstalledAgentSkillOptions = {}
): InstalledAgentSkillState {
  return useInstalledAgentSkillNames([skillName], options)
}

export function useInstalledAgentSkillNames(
  skillNames: readonly string[],
  options: InstalledAgentSkillOptions = {}
): InstalledAgentSkillState {
  const { enabled = true, discoveryTarget, sourceKinds } = options
  const skillNamesKey = skillNames.map(normalizeInstalledSkillName).join('\n')
  const candidateSkillNames = skillNamesKey.split('\n')
  const discoveryTargetKey = getSkillDiscoveryTargetKey(discoveryTarget)
  const cachedDiscovery = peekInstalledAgentSkillDiscovery(discoveryTargetKey)
  const queryClient = useQueryClient()
  const queryKey = ['installed-agent-skills', discoveryTargetKey] as const
  const discovery = useQuery({
    queryKey,
    queryFn: () => discoverInstalledAgentSkills(false, discoveryTarget),
    enabled,
    initialData: cachedDiscovery ?? undefined
  })

  const refresh = useEventCallback(async (force = true): Promise<boolean> => {
    if (!enabled) {
      return false
    }
    const next = await discoverInstalledAgentSkills(force, discoveryTarget)
    queryClient.setQueryData(queryKey, next)
    return hasInstalledAgentSkillNamed(next.skills, candidateSkillNames, { sourceKinds })
  })

  useEffect(() => {
    if (!enabled) {
      return
    }
    const refreshFromExternalChange = (): void => {
      void refresh(true)
    }
    // Why: skill install commands run outside React state, often in a terminal.
    // Refresh on focus and explicit install events so completion is detected.
    window.addEventListener('focus', refreshFromExternalChange)
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refreshFromExternalChange)
    return () => {
      window.removeEventListener('focus', refreshFromExternalChange)
      window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refreshFromExternalChange)
    }
  }, [enabled, refresh])

  const skills = (() => (enabled && discovery.data ? discovery.data.skills : []))()

  const installed = (() =>
    enabled ? hasInstalledAgentSkillNamed(skills, candidateSkillNames, { sourceKinds }) : false)()

  useEffect(() => {
    if (installed && candidateSkillNames.some(isOrchestrationSkillName)) {
      // Why: every orchestration entry point shares this setup marker, so
      // detecting the installed skill on one surface satisfies the others.
      markOrchestrationSetupComplete()
    }
  }, [candidateSkillNames, installed])

  const forceRefresh = () => refresh(true)

  return {
    installed,
    loading: enabled && discovery.isPending,
    error:
      discovery.error instanceof Error
        ? discovery.error.message
        : discovery.error
          ? 'Could not scan installed skills.'
          : null,
    skills,
    refresh: forceRefresh
  }
}
