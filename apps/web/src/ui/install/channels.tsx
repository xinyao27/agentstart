import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { siteLinks } from '../../site-links'

type ChannelLink = {
  label: string
  href: string
  /**
   * Why: one entry carries the emphasis. The daemon and extension links are reference
   * material for something the installer already put on the machine; TestFlight is the
   * step left to take, so it gets the only filled control.
   */
  featured?: boolean
}

const channelLinks: readonly ChannelLink[] = [
  { label: 'Rust daemon', href: siteLinks.daemon },
  { label: 'Chrome extension', href: siteLinks.extension },
  { label: 'iOS', href: siteLinks.testflight, featured: true }
]

/**
 * Why: this is the `Use AgentStart` entry's content, so it renders inside the install
 * box rather than as a row of its own.
 */
export function Channels(): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 font-mono text-[14px]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
        {channelLinks.map((link) =>
          link.featured ? (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="bg-accent text-accent-ink rounded-chip inline-flex items-center gap-1.5 px-2.5 py-1 transition-opacity hover:opacity-90"
            >
              {link.label}
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" aria-hidden="true" />
            </a>
          ) : (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="text-ink hover:text-accent transition-colors"
            >
              {link.label}
            </a>
          )
        )}
      </div>
      <a
        href={siteLinks.license}
        target="_blank"
        rel="noreferrer"
        className="text-faint hover:text-ink shrink-0 font-mono text-[12px] transition-colors"
      >
        MIT
      </a>
    </div>
  )
}
