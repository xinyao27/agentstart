import type { DiscoveredSkill } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'
import { skillPlacements } from '~renderer/skills/installation'

import { shortRootLabel } from './placement-labels'

/**
 * How many directories a row covers, and what tells it apart from its twins.
 *
 * Why the second half: drifted copies split into separate rows, so a slug can
 * appear twice. A bare count would leave the two rows indistinguishable, which
 * is the exact confusion the split exists to prevent.
 */
export type SkillPlacementSummary = {
  count: number
  distinguishingLabel: string | null
}

export function summarizeSkillPlacements(
  skills: readonly DiscoveredSkill[]
): Map<string, SkillPlacementSummary> {
  const rowsByFolderName = new Map<string, number>()
  for (const skill of skills) {
    rowsByFolderName.set(skill.folderName, (rowsByFolderName.get(skill.folderName) ?? 0) + 1)
  }
  return new Map(
    skills.map((skill) => {
      const placements = skillPlacements(skill)
      const primary = placements[0]
      return [
        skill.id,
        {
          count: placements.length,
          distinguishingLabel:
            (rowsByFolderName.get(skill.folderName) ?? 0) > 1 && primary
              ? shortRootLabel(primary)
              : null
        }
      ]
    })
  )
}

/**
 * The row's badge text, or null when there is nothing worth saying.
 *
 * A lone directory with no twin row is the unremarkable case: the detail pane
 * names it anyway, so a badge repeating "1 directory" on most rows would only
 * crowd out the skill name.
 */
export function describeSkillPlacements(summary: SkillPlacementSummary): string | null {
  if (summary.distinguishingLabel) {
    return summary.count > 1
      ? translate('auto.components.skills.placements.distinguished', '{{value0}} +{{value1}}', {
          value0: summary.distinguishingLabel,
          value1: summary.count - 1
        })
      : summary.distinguishingLabel
  }
  return summary.count > 1
    ? translate('auto.components.skills.placements.many', '{{value0}} directories', {
        value0: summary.count
      })
    : null
}
