export function normalizeKagiSessionLink(rawLink: string): string | null {
  const trimmed = rawLink.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = new URL(trimmed)
    const hostname = parsed.hostname.toLowerCase()
    const token = parsed.searchParams.get('token')?.trim()
    // Why: reject user-info credentials and non-default ports so a hostile
    // paste cannot smuggle alternate auth or a redirected origin into the
    // saved session URL. Accept /search and /search/ since Kagi's settings
    // page emits both.
    const pathOk = parsed.pathname === '/search' || parsed.pathname === '/search/'
    if (
      parsed.protocol !== 'https:' ||
      (hostname !== 'kagi.com' && hostname !== 'www.kagi.com') ||
      !pathOk ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.port !== '' ||
      !token
    ) {
      return null
    }
    parsed.searchParams.delete('q')
    // Why: collapse any duplicate token params so we don't echo two bearer
    // values back to Kagi on every search.
    parsed.searchParams.set('token', token)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

export function redactKagiSessionToken(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    const hostname = parsed.hostname.toLowerCase()
    if (
      parsed.protocol === 'https:' &&
      (hostname === 'kagi.com' || hostname === 'www.kagi.com') &&
      (parsed.pathname === '/search' || parsed.pathname === '/search/') &&
      parsed.searchParams.has('token')
    ) {
      // Why: Kagi private-session links carry an account bearer token. Strip it
      // before URLs reach display, history, or persisted browser-tab state.
      parsed.searchParams.delete('token')
      return parsed.toString()
    }
  } catch {
    // Keep non-URL inputs unchanged.
  }
  return rawUrl
}
