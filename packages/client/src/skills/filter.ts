import type { DiscoveredSkill, SkillProvider, SkillSourceKind } from '@agentstart/protocol'
import { isUtf8ByteLengthOverLimit } from '@agentstart/protocol/text/utf8-length'
import { skillPlacements } from '~renderer/skills/installation'

export type SkillsFilterState = {
  query: string
  sourceKind: SkillSourceKind | 'all'
  provider: SkillProvider | 'all'
}

const SKILLS_FILTER_QUERY_MAX_BYTES = 2 * 1024

function isSkillsFilterQueryTooLarge(
  query: string,
  maxBytes = SKILLS_FILTER_QUERY_MAX_BYTES
): boolean {
  return isUtf8ByteLengthOverLimit(query, maxBytes)
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function filterSkills(
  skills: readonly DiscoveredSkill[],
  filters: SkillsFilterState
): DiscoveredSkill[] {
  if (isSkillsFilterQueryTooLarge(filters.query)) {
    return []
  }
  const query = normalize(filters.query)
  return skills.filter((skill) => {
    const placements = skillPlacements(skill)
    // Why: one row now spans every directory holding the skill, so a source or
    // path filter has to match any of them — filtering on the row's primary
    // placement alone would hide a repo copy behind its home twin.
    if (
      filters.sourceKind !== 'all' &&
      !placements.some((placement) => placement.sourceKind === filters.sourceKind)
    ) {
      return false
    }
    if (filters.provider !== 'all' && !skill.providers.includes(filters.provider)) {
      return false
    }
    if (!query) {
      return true
    }
    const haystack = [
      skill.name,
      skill.folderName,
      skill.description ?? '',
      skill.providers.join(' '),
      ...placements.map((placement) => `${placement.sourceLabel} ${placement.directoryPath}`)
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
}
