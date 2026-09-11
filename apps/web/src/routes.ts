export const SITE_ORIGIN = 'https://agentstart.ai'

export type RouteMeta = {
  path: string
  /**
   * Built file relative to dist. Cloudflare's asset router drops the `.html`, so
   * `faq.html` is served at `/faq` and `/faq.html` redirects there — the same
   * behaviour 404.html already relies on.
   */
  file: string
  title: string
  description: string
}

export function canonicalUrl(meta: RouteMeta): string {
  return meta.path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${meta.path}`
}

/**
 * Why: `as`, and narrowly. HeadContent serialises a `script:ld+json` meta entry into
 * a JSON-LD script — verified in the router's headContentUtils — but the `meta` array
 * is typed as MetaHTMLAttributes, which has no such key. The cast is the only place
 * that gap is crossed.
 */
export function jsonLdMeta(graph: object): Record<string, string> {
  return { 'script:ld+json': graph } as unknown as Record<string, string>
}

/**
 * Why: the per-page half of the head, as the `meta` array TanStack's HeadContent
 * consumes. It dedupes by `name ?? property`, so a route that wants a different
 * image or locale can declare it and win over the root's.
 */
export function documentMeta(meta: RouteMeta): Record<string, string>[] {
  const url = canonicalUrl(meta)
  return [
    { title: meta.title },
    { name: 'description', content: meta.description },
    { property: 'og:title', content: meta.title },
    { property: 'og:description', content: meta.description },
    { property: 'og:url', content: url },
    { name: 'twitter:title', content: meta.title },
    { name: 'twitter:description', content: meta.description }
  ]
}

export function documentLinks(meta: RouteMeta): Record<string, string>[] {
  return [{ rel: 'canonical', href: canonicalUrl(meta) }]
}
