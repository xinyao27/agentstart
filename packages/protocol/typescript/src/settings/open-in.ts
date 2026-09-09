export type OpenInApplication = {
  id: string
  label: string
  command: string
}

export type OpenInTargetKey = `application:${string}` | 'file-manager'

export const OPEN_IN_APPLICATIONS_MAX = 8
export const DEFAULT_OPEN_IN_APPLICATIONS: OpenInApplication[] = [
  { id: 'vscode', label: 'VS Code', command: 'code' }
]

type NormalizeOpenInApplicationsOptions = {
  createId?: () => string
  seedDefaults?: boolean
}

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function makeFallbackId(index: number): string {
  return `open-in-${index + 1}`
}

export function normalizeOpenInApplications(
  value: unknown,
  options: NormalizeOpenInApplicationsOptions = {}
): OpenInApplication[] {
  if (!Array.isArray(value)) {
    return options.seedDefaults ? [...DEFAULT_OPEN_IN_APPLICATIONS] : []
  }

  const normalized: OpenInApplication[] = []
  const seenIds = new Set<string>()

  for (const [index, row] of value.entries()) {
    if (normalized.length >= OPEN_IN_APPLICATIONS_MAX) {
      break
    }
    if (!row || typeof row !== 'object') {
      continue
    }

    const label = normalizeToken('label' in row ? row.label : undefined)
    const command = normalizeToken('command' in row ? row.command : undefined)
    if (!label || !command) {
      continue
    }

    let id = normalizeToken('id' in row ? row.id : undefined)
    if (!id) {
      id = normalizeToken(options.createId?.())
      if (!id) {
        id = makeFallbackId(index)
      }
    }

    if (seenIds.has(id)) {
      continue
    }
    seenIds.add(id)
    normalized.push({ id, label, command })
  }

  return normalized
}
