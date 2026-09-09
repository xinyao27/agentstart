import type { GlobalSettings } from '../settings/global/model.js'

export type BranchPrefixSettings = {
  branchPrefix: GlobalSettings['branchPrefix']
  branchPrefixCustom?: string
}

export function selectBranchPrefixInput(
  settings: BranchPrefixSettings,
  gitUsername: string | null
): string | null {
  switch (settings.branchPrefix) {
    case 'git-username':
      return gitUsername
    case 'custom':
      return settings.branchPrefixCustom ?? null
    case 'none':
      return null
  }
}

export function normalizeBranchPrefix(rawPrefix: string): string {
  return rawPrefix
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
}

const INVALID_BRANCH_PREFIX_CHARACTERS = /[~^:?*[\]\\]/

function hasControlOrSpace(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x20 || code === 0x7f
  })
}

export function getBranchPrefixIssue(rawPrefix: string): 'invalid-characters' | null {
  const normalizedPrefix = normalizeBranchPrefix(rawPrefix)
  if (!normalizedPrefix) {
    return null
  }
  if (
    hasControlOrSpace(normalizedPrefix) ||
    INVALID_BRANCH_PREFIX_CHARACTERS.test(normalizedPrefix) ||
    normalizedPrefix.includes('..') ||
    normalizedPrefix.includes('@{') ||
    normalizedPrefix.startsWith('-') ||
    normalizedPrefix.endsWith('.') ||
    normalizedPrefix
      .split('/')
      .some((segment) => segment.startsWith('.') || segment.endsWith('.lock'))
  ) {
    return 'invalid-characters'
  }
  return null
}
