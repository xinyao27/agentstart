import type { SkillFreshnessInventory } from '~renderer/skills/freshness-model'

import { getSkillFreshnessDisplayStatus } from '../skills/freshness-display-status'
import type {
  SettingsNavGroup,
  SettingsNavInstallStatus,
  SettingsNavSection,
  SettingsNavTarget
} from './navigation-types'

const SETTINGS_NAV_GROUPS = [
  {
    id: 'interface',
    titleKey: 'auto.components.settings.Settings.8bd117d669',
    titleDefault: 'Interface'
  },
  {
    id: 'capabilities',
    titleKey: 'auto.components.settings.Settings.23c6874fdf',
    titleDefault: 'AI Capabilities'
  },
  { id: 'setup', titleKey: 'auto.components.settings.Settings.9abb9be3bc', titleDefault: 'Set Up' },
  {
    id: 'workflows',
    titleKey: 'auto.components.settings.Settings.e1578cd4bc',
    titleDefault: 'Workflows'
  },
  {
    id: 'security',
    titleKey: 'auto.components.settings.Settings.084d8fac5b',
    titleDefault: 'Privacy & Security'
  },
  {
    id: 'advanced',
    titleKey: 'auto.components.settings.Settings.1c87f8d024',
    titleDefault: 'Advanced'
  },
  {
    id: 'experimental',
    titleKey: 'auto.components.settings.Settings.8b017f2506',
    titleDefault: 'Experimental'
  }
] as const

type SettingsNavGroupDefinition = (typeof SETTINGS_NAV_GROUPS)[number]

const SETTINGS_NAV_GROUP_BY_ID = new Map<string, SettingsNavGroupDefinition>(
  SETTINGS_NAV_GROUPS.map((group) => [group.id, group])
)

export function getSettingsSectionId(
  pane: SettingsNavTarget,
  repoId: string | null,
  repoIdToRepresentative: Map<string, string>
): string {
  if (pane === 'repo' && repoId) {
    // Why: a target can name any host's repo row, but Settings renders one collapsed pane per
    // project. Resolve to the representative section so the deep link lands.
    return `repo-${repoIdToRepresentative.get(repoId) ?? repoId}`
  }
  return pane
}

export function getFallbackVisibleSection(
  sections: SettingsNavSection[]
): SettingsNavSection | undefined {
  return sections.at(0)
}

export function buildSettingsNavGroups(
  sections: readonly SettingsNavSection[],
  query: string,
  translate: (key: string, fallback: string) => string
): SettingsNavGroup[] {
  const definitions = getSettingsNavGroupDefinitionsForSearch(sections, query)
  const generalSections = sections.filter((section) => !section.id.startsWith('repo-'))
  return definitions
    .map((group) => ({
      id: group.id,
      title: translate(group.titleKey, group.titleDefault),
      sections: generalSections.filter((section) => section.group === group.id)
    }))
    .filter((group) => group.sections.length > 0 || group.id === 'setup')
}

export function getSkillNavInstallStatus(skill: {
  name: string
  installed: boolean
  loading: boolean
  inventory: SkillFreshnessInventory | null
}): SettingsNavInstallStatus {
  if (skill.loading) {
    return 'checking'
  }
  if (!skill.installed) {
    return 'install'
  }
  return getSkillFreshnessDisplayStatus(skill.inventory, skill.name)
}

export function getSettingsScrollTarget(
  sectionId: string,
  container?: HTMLElement | null
): HTMLElement | null {
  return (
    container?.querySelector<HTMLElement>(`[data-settings-section="${CSS.escape(sectionId)}"]`) ??
    document.getElementById(sectionId)
  )
}

export function scrollSettingsSubsection(targetId: string, container?: HTMLElement | null): void {
  const target = getSettingsScrollTarget(targetId, container)
  if (!target) {
    return
  }
  if (!container) {
    target.scrollIntoView({ block: 'start' })
    return
  }
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTop = targetRect.top - containerRect.top + container.scrollTop
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  container.scrollTo({ top: Math.min(Math.max(0, targetTop - 16), maxScrollTop) })
}

export function cancelSettingsSubsectionScroll(frame: number | null): void {
  if (frame !== null) {
    cancelAnimationFrame(frame)
  }
}

function getSettingsNavGroupDefinitionsForSearch(
  sections: readonly SettingsNavSection[],
  query: string
): readonly SettingsNavGroupDefinition[] {
  if (query.trim() === '') {
    return SETTINGS_NAV_GROUPS
  }
  const seenGroupIds = new Set<string>()
  return sections.flatMap((section) => {
    if (section.id.startsWith('repo-') || seenGroupIds.has(section.group)) {
      return []
    }
    const group = SETTINGS_NAV_GROUP_BY_ID.get(section.group)
    if (!group) {
      return []
    }
    seenGroupIds.add(section.group)
    return [group]
  })
}
