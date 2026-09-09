import { canonicalizeSkillInstallSource } from '~renderer/skills/install-source'

import type { SkillInstallRequest } from './install-dialog'

export const SKILLS_MARKETPLACE_URL = 'https://skills.sh'

const SKILLS_MARKETPLACE_HOSTS = new Set(['skills.sh', 'www.skills.sh'])
// Why: every registry page shares the /{owner}/{repo} shape, so the site's own
// routes would otherwise read as installable sources.
const RESERVED_FIRST_SEGMENTS = new Set([
  'api',
  'about',
  'auth',
  'docs',
  'help',
  'legal',
  'login',
  'logout',
  'new',
  'privacy',
  'search',
  'settings',
  'signin',
  'signup',
  'terms'
])
const SKILL_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const WELL_KNOWN_DOMAIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/

/**
 * The install the currently open skills.sh page describes, if any.
 *
 * Handles both `skills.sh/{owner}/{repo}[/{skill}]` and the well-known
 * `skills.sh/{domain.com}/{skill}` pages; anything the CLI could not accept as
 * a source resolves to null so the caller keeps its button disabled.
 */
export function skillsMarketplaceInstallTarget(url: string): SkillInstallRequest | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!SKILLS_MARKETPLACE_HOSTS.has(parsed.hostname.toLowerCase())) {
    return null
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  const [first, second, third] = segments
  if (!first || RESERVED_FIRST_SEGMENTS.has(first.toLowerCase())) {
    return null
  }

  // Why: a well-known publisher page puts the domain in the first segment, so
  // its second segment is the skill rather than half of an `owner/repo` pair.
  const wellKnownDomain = WELL_KNOWN_DOMAIN_RE.test(first)
  const rawSource = wellKnownDomain ? first : second ? `${first}/${second}` : null
  const rawSkill = wellKnownDomain ? second : third
  const source = rawSource ? canonicalizeSkillInstallSource(rawSource) : null
  if (!source) {
    return null
  }
  return {
    source,
    skillName: rawSkill && SKILL_SLUG_RE.test(rawSkill) ? rawSkill : ''
  }
}
