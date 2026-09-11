import {
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  GlobeIcon,
  Search01Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from 'cnfast'

import { OrbLoader } from './orb-loader'
import { FRESH_RESULTS, SEARCH_QUERY, STALE_RESULTS } from './state'
import type { DemoState } from './state'

export type BrowserPaneProps = {
  state: DemoState
}

/**
 * Why: the toolbar makes the Chrome workspace context legible in the landing
 * illustration. Reload swaps to the loader while the page is busy.
 *
 * The bug has to be visible here, because this is where a change gets verified:
 * before the fix the rows still answer the previous query.
 */
export function BrowserPane({ state }: BrowserPaneProps): React.JSX.Element {
  const results = state.browserFresh ? FRESH_RESULTS : STALE_RESULTS
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-hairline flex h-8 shrink-0 items-center gap-1 border-b px-2">
        <span className="text-faint inline-flex size-5 shrink-0 items-center justify-center">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" aria-hidden="true" />
        </span>
        <span className="text-rule-strong inline-flex size-5 shrink-0 items-center justify-center">
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" aria-hidden="true" />
        </span>
        <span className="text-faint inline-flex size-5 shrink-0 items-center justify-center">
          {state.browserReloading ? (
            <OrbLoader className="size-3.5" />
          ) : (
            <HugeiconsIcon
              icon={ArrowReloadHorizontalIcon}
              className="size-3.5"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="border-hairline ml-1 flex min-w-0 flex-1 items-center gap-1.5 border px-2 py-[3px]">
          <HugeiconsIcon
            icon={GlobeIcon}
            className="text-faint size-3 shrink-0"
            aria-hidden="true"
          />
          <span className="text-copy truncate font-mono text-[10.5px]/[1.3]">
            localhost:3000/search
          </span>
        </span>
      </div>

      <div className="min-w-0 flex-1 p-3">
        <div className="border-rule text-ink flex items-center gap-2 border px-2 py-1.5 text-[11.5px]/[1.4]">
          <HugeiconsIcon
            icon={Search01Icon}
            className="text-faint size-3 shrink-0"
            aria-hidden="true"
          />
          <span className="truncate">{SEARCH_QUERY}</span>
        </div>

        <div
          className={cn(
            'mt-2.5 transition-opacity duration-200',
            state.browserReloading && 'opacity-40'
          )}
        >
          {results.map((result) => (
            <div
              key={result.name}
              className="border-hairline flex items-baseline justify-between border-b py-1.5 text-[11.5px]/[1.5] last:border-b-0"
            >
              <span className="text-copy truncate">{result.name}</span>
              <span className="text-faint shrink-0 font-mono text-[11px]/[1.5] tabular-nums">
                {result.price}
              </span>
            </div>
          ))}
        </div>

        {!state.browserFresh && !state.browserReloading ? (
          <p className="text-del-ink mt-2.5 text-[11px]/[1.4]">
            Showing results for the previous query
          </p>
        ) : null}
      </div>
    </div>
  )
}
