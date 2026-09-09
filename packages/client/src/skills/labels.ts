import type { SkillProvider, SkillSourceKind } from '@yiru/protocol'

export const providerLabels: Record<SkillProvider, string> = {
  codex: 'Codex',
  claude: 'Claude',
  'agent-skills': 'Agent Skills'
}

export const sourceLabels: Record<SkillSourceKind, string> = {
  home: 'Home',
  repo: 'Repository',
  bundled: 'Bundled',
  plugin: 'Plugin'
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

export function formatUpdatedAt(value: number | null): string {
  return value ? dateFormatter.format(new Date(value)) : 'Unknown'
}

const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB']

export function formatFileSize(bytes: number): string {
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${unitIndex === 0 ? size : size.toFixed(1)} ${FILE_SIZE_UNITS[unitIndex]}`
}
