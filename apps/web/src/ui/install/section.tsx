import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'

import { Channels } from './channels'
import { installCommands } from './commands'
import { InstallSwitcher } from './switcher'

const entries = [...installCommands, { label: 'Use AgentStart', content: <Channels /> }]

/**
 * Why: the household rule for this page is that it stays the size of a business card,
 * so the guide link rides the heading row rather than claiming one of its own, and the
 * channels are the switcher's third entry rather than a row below it.
 */
export function InstallSection(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-ink text-[17px] leading-[1.4] font-semibold">Install</h2>
        <Link
          to="/install"
          className="decoration-copy/30 hover:text-label hover:decoration-label inline-flex items-center gap-1.5 text-[14px] underline underline-offset-[3px] transition-colors"
        >
          Full install guide
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <InstallSwitcher entries={entries} />
    </section>
  )
}
