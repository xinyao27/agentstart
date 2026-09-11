type WebWorkerEnvironment = {
  ASSETS: Fetcher
}

// Why: the site is static, but the apex and www hostnames both resolve to this
// Worker. Serving identical bytes from two hostnames splits SEO signals, so www
// is redirected here rather than in a dashboard-only rule that is invisible to
// this repository.
const CANONICAL_HOSTNAME = 'agentstart.ai'
const GITHUB_REPOSITORY_URL = 'https://github.com/xinyao27/agentstart'
const GITHUB_RELEASES_URL = `${GITHUB_REPOSITORY_URL}/releases`
const REDIRECTED_HOSTNAMES = new Set([`www.${CANONICAL_HOSTNAME}`])

// Why: old installations and links still reach /download and /docs/*. Keeping
// those redirects avoids soft 404s while the landing site stays intentionally
// small; /privacy is now a first-class page and must fall through to assets.
//
// Every one is 302, never 301: a real /download page and real documentation are
// both still on the table, and a permanent redirect is cached by browsers and
// search engines well past the point where publishing those pages would take
// effect — there is no way to call it back.
const TEMPORARY_REDIRECT = 302
const DOWNLOAD_PATH = '/download'
const DOCUMENTATION_PREFIX = '/docs'

function isDocumentationPath(pathname: string): boolean {
  return pathname === DOCUMENTATION_PREFIX || pathname.startsWith(`${DOCUMENTATION_PREFIX}/`)
}

export default {
  async fetch(request: Request, env: WebWorkerEnvironment): Promise<Response> {
    const url = new URL(request.url)
    if (REDIRECTED_HOSTNAMES.has(url.hostname)) {
      url.hostname = CANONICAL_HOSTNAME
      return Response.redirect(url.toString(), 301)
    }

    // Why: /download and /download/ have to land in the same place; a trailing
    // slash is what a stray copy-paste adds. Root keeps its own slash.
    const pathname = url.pathname === '/' ? url.pathname : url.pathname.replace(/\/+$/, '')

    if (pathname === DOWNLOAD_PATH) {
      return Response.redirect(`${GITHUB_RELEASES_URL}/latest`, TEMPORARY_REDIRECT)
    }

    if (isDocumentationPath(pathname)) {
      return Response.redirect(GITHUB_REPOSITORY_URL, TEMPORARY_REDIRECT)
    }

    return env.ASSETS.fetch(request)
  }
}
