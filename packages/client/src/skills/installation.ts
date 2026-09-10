import type { DiscoveredSkill, SkillPlacement } from '@agentstart/protocol'

export function skillPlacements(skill: DiscoveredSkill): SkillPlacement[] {
  if (skill.placements?.length) {
    return skill.placements
  }
  return [
    {
      id: skill.id,
      rootId: skill.rootPath,
      rootPath: skill.rootPath,
      rootLabel: skill.sourceLabel,
      owner: null,
      providers: skill.providers,
      sourceKind: skill.sourceKind,
      sourceLabel: skill.sourceLabel,
      directoryPath: skill.directoryPath,
      skillFilePath: skill.skillFilePath,
      linkTargetPath: null,
      topology: 'unknown',
      fileCount: skill.fileCount,
      updatedAt: skill.updatedAt
    }
  ]
}

export function skillDirectoryName(
  skill: Pick<DiscoveredSkill, 'folderName' | 'directoryPath'>
): string {
  if (skill.folderName) {
    return skill.folderName
  }
  const segments = skill.directoryPath.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? skill.directoryPath
}
