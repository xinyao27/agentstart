import { canonicalUrl, SITE_ORIGIN } from './routes'
import type { RouteMeta } from './routes'
import { faqEntries } from './ui/faq/questions'

/**
 * Why: returned as objects, not as `<script>` strings. `head().meta` accepts a
 * `script:ld+json` entry and serialises it itself, so this goes out through the same
 * mechanism as the rest of the head and the build no longer has to splice HTML.
 *
 * The FAQ block quotes the same array the page renders. Google treats structured data
 * that disagrees with the visible text as spam, and a second copy of eight paragraphs
 * guarantees one of them drifts. The product entity belongs on the homepage only, not
 * on every document that shares the shell.
 */
const publisher = {
  '@type': 'Organization',
  '@id': `${SITE_ORIGIN}/#publisher`,
  name: 'AgentStart',
  url: `${SITE_ORIGIN}/`,
  logo: `${SITE_ORIGIN}/favicon.png`,
  sameAs: ['https://github.com/xinyao27/agentstart', 'https://github.com/xinyao27']
}

const website = {
  '@type': 'WebSite',
  '@id': `${SITE_ORIGIN}/#website`,
  url: `${SITE_ORIGIN}/`,
  name: 'AgentStart',
  inLanguage: 'en',
  publisher: { '@id': publisher['@id'] }
}

// Why: no aggregateRating. There is no rating data to state, and a fabricated one is
// rich-result spam. No version number either — nothing here may go stale.
const application = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE_ORIGIN}/#app`,
  name: 'AgentStart',
  alternateName: 'AgentStart coding agent workspace',
  description:
    'An open-source Chrome workspace and native Rust daemon for running coding agents in isolated git worktrees.',
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Development Tool',
  operatingSystem: 'Chrome, macOS, Windows, Linux, iOS',
  url: `${SITE_ORIGIN}/`,
  image: `${SITE_ORIGIN}/og.jpg`,
  downloadUrl: 'https://github.com/xinyao27/agentstart/releases/latest',
  license: 'https://github.com/xinyao27/agentstart/blob/main/LICENSE',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Chrome side panel and tab workspaces',
    'Runs Claude Code, Codex, and terminal coding agents',
    'One isolated git worktree per agent session',
    'Native Rust daemon for local, WSL, and remote hosts',
    'Direct end-to-end encrypted iOS companion pairing',
    'Open source under the MIT license'
  ],
  publisher: { '@id': publisher['@id'] }
}

export function productGraph(): object {
  return { '@context': 'https://schema.org', '@graph': [website, publisher, application] }
}

export function faqGraph(meta: RouteMeta): object {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      website,
      publisher,
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl(meta)}#faq`,
        url: canonicalUrl(meta),
        name: meta.title,
        isPartOf: { '@id': website['@id'] },
        mainEntity: faqEntries.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer }
        }))
      }
    ]
  }
}
