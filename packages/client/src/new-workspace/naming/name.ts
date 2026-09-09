function foldWorkspaceNameWhitespaceToHyphen(input: string): string {
  let result = ''
  let pendingHyphen = false
  for (let index = 0; index < input.length; index += 1) {
    if (isWorkspaceNameWhitespace(input.charCodeAt(index))) {
      pendingHyphen = true
      continue
    }
    if (pendingHyphen) {
      result += '-'
      pendingHyphen = false
    }
    result += input[index]
  }
  return result
}

function normalizeApostrophes(input: string): string {
  return input.replace(/[‘’]/g, "'")
}

// Why: contractions and possessives should not become stray `t` / `s` tokens
// in display names or extra hyphen segments in branch-safe workspace seeds.
function removeIntraWordApostrophes(input: string): string {
  return normalizeApostrophes(input).replace(/([\p{L}\p{N}])'(?=[\p{L}\p{N}])/gu, '$1')
}

export function slugifyForWorkspaceName(input: string): string {
  const normalized = removeIntraWordApostrophes(input)
    .trim()
    .toLowerCase()
    .replace(/[\\/]+/g, '-')
  return (
    foldWorkspaceNameWhitespaceToHyphen(normalized)
      .replace(/[^a-z0-9._-]+/g, '-')
      // Why: git check-ref-format rejects any ref containing `..`, so previews
      // must match the main-process sanitizer before workspace creation.
      .replace(/\.{2,}/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 48)
      .replace(/[-._]+$/g, '')
  )
}

export function getLinkedWorkItemSuggestedName(item: { title: string }): string {
  const seed = getLinkedWorkItemTitleSubject(item) || item.title.trim()
  return slugifyForWorkspaceName(seed)
}

export type WorkspaceIntentWorkItem = {
  type: 'pr'
  number: number
  title: string
}

export type WorkspaceIntentName = {
  displayName: string
  seedName: string
}

function getLinkedWorkItemTitleSubject(item: { title: string }): string {
  return item.title
    .trim()
    .replace(/^(?:pr|pull request)\s*#?\d+\s*[:-]\s*/i, '')
    .replace(/^#\d+\s*[:-]\s*/, '')
    .replace(/\([#!]?\d+\)/g, '')
    .replace(/\b#\d+\b/g, '')
    .trim()
}

function workItemIdentity(item: WorkspaceIntentWorkItem): string {
  return `PR ${item.number}`
}

export function getLinkedWorkItemWorkspaceName(
  item: WorkspaceIntentWorkItem
): WorkspaceIntentName | null {
  const subject = getLinkedWorkItemTitleSubject(item) || item.title.trim()
  const displayName = subject || workItemIdentity(item)
  const seedName = slugifyForWorkspaceName(displayName)
  return seedName ? { displayName, seedName } : null
}

function isWorkspaceNameWhitespace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 160 ||
    code === 5760 ||
    (code >= 8192 && code <= 8202) ||
    code === 8232 ||
    code === 8233 ||
    code === 8239 ||
    code === 8287 ||
    code === 12288 ||
    code === 65279
  )
}
