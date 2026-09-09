import type { DiscoveredSkill, SkillSourceKind } from '@yiru/protocol'
import { ORCHESTRATION_SKILL_NAME } from '~renderer/agent/feature-install-commands'

type InstalledAgentSkillMatchOptions = {
  sourceKinds?: readonly SkillSourceKind[]
}

export function normalizeInstalledSkillName(value: string): string {
  return value.trim().toLowerCase()
}

export function isOrchestrationSkillName(skillName: string): boolean {
  return normalizeInstalledSkillName(skillName) === ORCHESTRATION_SKILL_NAME
}

function basenameFromPath(pathValue: string): string {
  return pathValue.split(/[\\/]/).findLast(Boolean) ?? pathValue
}

export function hasInstalledAgentSkill(
  skills: readonly DiscoveredSkill[],
  skillName: string,
  options: InstalledAgentSkillMatchOptions = {}
): boolean {
  return hasInstalledAgentSkillNamed(skills, [skillName], options)
}

export function hasInstalledAgentSkillNamed(
  skills: readonly DiscoveredSkill[],
  skillNames: readonly string[],
  options: InstalledAgentSkillMatchOptions = {}
): boolean {
  const expected = new Set(skillNames.map(normalizeInstalledSkillName))
  return skills.some((skill) => {
    if (
      !skill.installed ||
      (options.sourceKinds && !options.sourceKinds.includes(skill.sourceKind))
    ) {
      return false
    }
    return (
      expected.has(normalizeInstalledSkillName(skill.name)) ||
      expected.has(normalizeInstalledSkillName(basenameFromPath(skill.directoryPath)))
    )
  })
}
