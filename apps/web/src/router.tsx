import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { RouterHistory } from '@tanstack/react-router'

import { Layout } from './layout'
import { documentLinks, documentMeta, jsonLdMeta, SITE_ORIGIN } from './routes'
import type { RouteMeta } from './routes'
import { Shell } from './shell'
import { faqGraph, productGraph } from './structured-data'
import { FaqPage } from './ui/faq/page'
import { Home } from './ui/home'
import { PrivacyPage, TermsPage } from './ui/legal/page'

/**
 * Why: code-based routes rather than the file-based plugin. File routes buy their
 * keep at the point there are enough of them to make the boilerplate hurt; today
 * there are four, and the plugin's generated route tree is a build artifact checked
 * into source that then has to be kept current. Swapping later is contained here.
 *
 * Each route owns its own head. `head().meta` carries the title, description and the
 * og/twitter pairs, and `script:ld+json` is a first-class entry in it — so the JSON-LD
 * comes from the same data the page renders, through the same mechanism, rather than
 * being injected into the HTML afterwards by the build.
 */
const rootRoute = createRootRoute({
  shellComponent: Shell,
  // Why: the shell is the document, the component is the chrome inside it — the
  // container, the one <main>, the footer. Both belong to the root route so every
  // page inherits them and each page component is only its own content.
  component: Layout,
  // Why: the tags that are the same on every page. HeadContent dedupes meta by
  // name/property, so a route can override any of these by declaring its own.
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'robots', content: 'index, follow, max-image-preview:large' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'AgentStart' },
      { property: 'og:locale', content: 'en_US' },
      // Why: 1200x675 keeps the artwork's own 16:9 framing. Cropping to the 1.91:1
      // Facebook documents clips the wordmark top and bottom, and both networks
      // letterbox 16:9 anyway. JPEG because the source is a smooth gradient:
      // 133 kB against 925 kB as PNG.
      { property: 'og:image', content: `${SITE_ORIGIN}/og.jpg` },
      { property: 'og:image:type', content: 'image/jpeg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '675' },
      {
        property: 'og:image:alt',
        content: 'AgentStart running coding agents across isolated git worktrees'
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: `${SITE_ORIGIN}/og.jpg` }
    ],
    links: [
      { rel: 'icon', href: '/favicon.png', type: 'image/png' },
      // Why: both faces are needed above the fold — the heading is sans, the
      // download row is mono. `crossorigin` is required even same-origin, or the
      // preload is fetched twice. The faces are declared in src/index.css.
      {
        rel: 'preload',
        href: '/fonts/geist-variable.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous'
      },
      {
        rel: 'preload',
        href: '/fonts/geist-mono-variable.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous'
      }
    ]
  })
})

const homeMeta: RouteMeta = {
  path: '/',
  file: 'index.html',
  title: 'AgentStart — Coding agents in Chrome and isolated worktrees',
  description:
    'Open-source AI agent editor IDE. Run Claude Code, Codex, and any CLI agent in isolated git worktrees — on macOS, Windows, Linux, WSL, or SSH. Review and merge from your phone.'
}

const faqMeta: RouteMeta = {
  path: '/faq',
  file: 'faq.html',
  title: 'AgentStart questions — what a coding agent workspace does',
  description:
    'What an AI agent workspace is, which of the 35 coding agents AgentStart runs, why each task gets its own git worktree, how remote hosts work, and what the mobile app is for.'
}

const privacyMeta: RouteMeta = {
  path: '/privacy',
  file: 'privacy.html',
  title: 'AgentStart privacy policy',
  description:
    'How AgentStart handles browser context, coding workspace data, telemetry, support reports, permissions, storage, and deletion.'
}

const termsMeta: RouteMeta = {
  path: '/terms',
  file: 'terms.html',
  title: 'AgentStart terms of use',
  description:
    'The terms for using the AgentStart website, Chrome extension, Rust daemon, iOS companion, and open-source materials.'
}

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
  head: () => ({
    meta: [...documentMeta(homeMeta), jsonLdMeta(productGraph())],
    links: documentLinks(homeMeta)
  })
})

const faqRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/faq',
  component: FaqPage,
  head: () => ({
    meta: [...documentMeta(faqMeta), jsonLdMeta(faqGraph(faqMeta))],
    links: documentLinks(faqMeta)
  })
})

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: PrivacyPage,
  head: () => ({
    meta: documentMeta(privacyMeta),
    links: documentLinks(privacyMeta)
  })
})

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: TermsPage,
  head: () => ({
    meta: documentMeta(termsMeta),
    links: documentLinks(termsMeta)
  })
})

const routeTree = rootRoute.addChildren([homeRoute, faqRoute, privacyRoute, termsRoute])

/** Why: the prerender step needs the list without constructing a router first. */
export const routeMetas: readonly RouteMeta[] = [homeMeta, faqMeta, privacyMeta, termsMeta]

export function createAppRouter(history: RouterHistory): ReturnType<typeof createRouter> {
  return createRouter({ routeTree, history })
}
