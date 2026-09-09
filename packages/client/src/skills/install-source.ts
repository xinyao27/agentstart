const SKILL_INSTALL_SOURCE_MAX_LENGTH = 200
// Why: the source becomes an argv entry next to a resolved npx path that the
// Windows rail re-quotes into cmd.exe. Whitelisting the characters a real
// `owner/repo`, GitHub URL, or well-known domain needs keeps shell syntax out.
const SKILL_INSTALL_SOURCE_CHARS_RE = /^[A-Za-z0-9._/:-]+$/
const GITHUB_REPOSITORY_URL_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*?)(?:\.git)?(?:\/.*)?$/
const OWNER_REPOSITORY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/
const WELL_KNOWN_DOMAIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/

export function canonicalizeSkillInstallSource(input: string): string | null {
  const trimmed = input.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > SKILL_INSTALL_SOURCE_MAX_LENGTH ||
    !SKILL_INSTALL_SOURCE_CHARS_RE.test(trimmed)
  ) {
    return null
  }
  const githubRepository = GITHUB_REPOSITORY_URL_RE.exec(trimmed)
  if (githubRepository) {
    return `${githubRepository[1]}/${githubRepository[2]}`
  }
  if (OWNER_REPOSITORY_RE.test(trimmed)) {
    return trimmed
  }
  return WELL_KNOWN_DOMAIN_RE.test(trimmed) ? trimmed : null
}
