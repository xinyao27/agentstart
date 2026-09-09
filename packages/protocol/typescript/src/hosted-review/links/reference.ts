// Why: a single, host-aware parser for the PR named in a prompt,
// shared by the sidebar workspace name and the tab
// title so both surface the same identifier. URLs are validated by *path
// structure* (owner/repo/pull/N) rather than hostname, which keeps GitHub
// Enterprise working while rejecting
// stray URLs that merely contain `/pull/<n>` (CDN assets, docs pages).

export type WorkIdentifier = {
  /** Human label, identifier-first, e.g. `PR 1033`. */
  label: string
  /** Lowercased identifier tokens, so consumers can drop them from a slug or
   *  description rather than echoing `Pr`, a bare number, or the review number twice. */
  tokens: string[]
}

// Prompts can be paste-sized, and a review target is named up front — so bound
// the scan to a prefix rather than running regexes over the whole prompt.
const IDENTIFIER_SCAN_LIMIT = 4096

const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]"']+/gi
const GITHUB_ITEM_PATH = /^\/[^/]+\/[^/]+\/pull\/(\d+)(?:[/?#]|$)/i

function taggedIdentifier(num: string): WorkIdentifier {
  return { label: `PR ${num}`, tokens: ['pr', num] }
}

function urlToIdentifier(raw: string): WorkIdentifier | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }
  const path = url.pathname
  const github = GITHUB_ITEM_PATH.exec(path)
  if (github) {
    return taggedIdentifier(github[1])
  }
  return null
}

function findUrlIdentifier(text: string): WorkIdentifier | null {
  const urls = text.match(URL_IN_TEXT)
  if (!urls) {
    return null
  }
  for (const raw of urls) {
    // Trim trailing sentence punctuation and markdown emphasis (`_`/`*`/`~`): a
    // URL wrapped like `_…/pull/5_` otherwise keeps the `_`, breaking the path
    // anchor so the identifier is lost.
    const identifier = urlToIdentifier(raw.replace(/[.,;:!?*_~]+$/, ''))
    if (identifier) {
      return identifier
    }
  }
  return null
}

/**
 * Pull the review-target identifier out of raw prompt text. Precedence runs from
 * most reliable (a GitHub PR URL) to least (a bare `#123`), so a real URL wins
 * over incidental numeric text. Returns null when the prompt names none.
 */
export function extractWorkIdentifier(text: string): WorkIdentifier | null {
  const scanned = text.slice(0, IDENTIFIER_SCAN_LIMIT)

  const urlIdentifier = findUrlIdentifier(scanned)
  if (urlIdentifier) {
    return urlIdentifier
  }

  const match =
    scanned.match(/\bpull\s+request\s*#?\s*(\d+)/i) ?? scanned.match(/\bpr\s*#?\s*(\d+)/i)
  if (match) {
    return taggedIdentifier(match[1])
  }

  return null
}

/**
 * Compose an identifier-first label — `PR 1033 - Review`, or just `PR 1033` when
 * there is no trailing detail. The single source of the format shared by the
 * sidebar name, tab title, and auto-rename name so they cannot drift apart.
 */
export function formatIdentifierFirst(label: string, detail: string): string {
  return detail ? `${label} - ${detail}` : label
}

/**
 * Remove the identifier's own tokens from a description so a caller can prepend
 * the label without echoing it — `PR 1094 - Review this PR` becomes
 * `PR 1094 - Review this`.
 */
export function stripWorkIdentifierEcho(text: string, identifier: WorkIdentifier): string {
  let stripped = text
  for (const token of identifier.tokens) {
    stripped = stripped.replace(new RegExp(`\\b${token}\\b`, 'gi'), ' ')
  }
  return stripped.replace(/\s+/g, ' ').trim()
}
