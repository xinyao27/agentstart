import { Link, Outlet, useRouterState } from '@tanstack/react-router'

import { ThemeToggle } from './chrome/theme-toggle'
import { siteLinks } from './site-links'

const footerLinks = [
  { label: 'GitHub', href: siteLinks.github },
  { label: 'Releases', href: siteLinks.releases },
  { label: 'Issues', href: siteLinks.issues }
]

const linkClasses =
  'decoration-copy/30 hover:text-label hover:decoration-label underline underline-offset-[3px] transition-colors'

/**
 * Why: the root route's component, so the chrome renders once and each page is just
 * its own content. The internal link is a router `Link` — it still emits a real
 * anchor with an href for crawlers, and takes the navigation client-side.
 */
export function Layout(): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const onFaq = pathname.replace(/\/+$/, '') === '/faq'

  return (
    <div className="bg-page min-h-screen">
      <div className="mx-auto flex max-w-[1120px] items-start justify-center px-4 sm:px-6">
        {/* Why: one uniform 24px gap between blocks and 12px inside pairs — the
            whole vertical rhythm, inherited type set once here.

            min-w-0 is load-bearing. A flex item defaults to min-width:auto, so
            without it this column is forced to the demo's min-content width and
            grows past a phone's viewport, cutting the prose off at the right edge.
            The demo keeps its own scroll track — see ui/demo/demo.tsx. */}
        <main className="border-hairline text-copy flex min-h-screen w-full max-w-[1120px] min-w-0 flex-col gap-7 px-6 pt-4 pb-20 text-[16px] leading-[26px] sm:border-x sm:px-18">
          <Outlet />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to={onFaq ? '/' : '/faq'} className={linkClasses}>
              {onFaq ? 'AgentStart' : 'Questions'}
            </Link>
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={linkClasses}
              >
                {link.label}
              </a>
            ))}
            <span className="ml-auto">
              <ThemeToggle />
            </span>
          </div>
        </main>
      </div>
    </div>
  )
}
