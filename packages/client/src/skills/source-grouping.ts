import type { DiscoveredSkill } from '@yiru/protocol'
import { skillDirectoryName } from '~renderer/skills/installation'

export type SkillSourceGroupKind = 'repository' | 'skill'

/** One row in the installed list: a lockfile source, or a skill the CLI
 *  never recorded a repository for. */
export type SkillSourceGroup = {
  id: string
  kind: SkillSourceGroupKind
  /** Canonical `owner/repo` when this row is a repository. */
  source: string | null
  label: string
  skills: DiscoveredSkill[]
}

function compareByName(left: DiscoveredSkill, right: DiscoveredSkill): number {
  return (
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
    left.folderName.localeCompare(right.folderName, undefined, { sensitivity: 'base' })
  )
}

function compareGroups(left: SkillSourceGroup, right: SkillSourceGroup): number {
  if (left.kind !== right.kind) {
    return left.kind === 'repository' ? -1 : 1
  }
  return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
}

/**
 * Collapses discovered skills into the unit the CLI actually installs:
 * a repository source. Skills the lockfile does not name stay as themselves
 * so a copied or bundled directory is not buried in a catch-all.
 */
export function groupSkillsBySource(skills: readonly DiscoveredSkill[]): SkillSourceGroup[] {
  const bySource = new Map<string, DiscoveredSkill[]>()
  const untracked: DiscoveredSkill[] = []
  for (const skill of skills) {
    const source = skill.installSource
    if (!source) {
      untracked.push(skill)
      continue
    }
    const group = bySource.get(source)
    if (group) {
      group.push(skill)
      continue
    }
    bySource.set(source, [skill])
  }
  const groups: SkillSourceGroup[] = []
  for (const [source, sourceSkills] of bySource) {
    groups.push({
      id: `source:${source}`,
      kind: 'repository',
      source,
      label: source,
      skills: [...sourceSkills].sort(compareByName)
    })
  }
  for (const skill of untracked) {
    groups.push({
      id: `skill:${skill.id}`,
      kind: 'skill',
      source: null,
      label: skill.name,
      skills: [skill]
    })
  }
  return groups.sort(compareGroups)
}

export function sourceGroupRemovableSkills(group: SkillSourceGroup): DiscoveredSkill[] {
  return group.skills.filter((skill) => skill.installed && skill.sourceKind === 'home')
}

/**
 * Folder names to hand `skills update` for this row.
 *
 * Why a lockfile source updates every home copy: that is the unit the CLI
 * installed, and the official freshness scan only knows Yiru's own skills.
 */
export function sourceGroupUpdateNames(
  group: SkillSourceGroup,
  isUpdatable: (skill: DiscoveredSkill) => boolean
): string[] {
  const skills =
    group.kind === 'repository'
      ? sourceGroupRemovableSkills(group)
      : group.skills.filter((skill) => isUpdatable(skill))
  return [...new Set(skills.map((skill) => skillDirectoryName(skill)))]
}
