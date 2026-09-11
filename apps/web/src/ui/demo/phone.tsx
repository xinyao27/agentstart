import { cn } from 'cnfast'

import { SessionView } from './session-view'
import type { DemoState } from './state'

export type PhoneProps = {
  state: DemoState
}

/**
 * Why: the bezel radius, island and side buttons depict hardware, not UI chrome —
 * without them the panel reads as another window instead of a phone. The 2px
 * radius budget still governs everything drawn on the screen.
 *
 * The screen renders the same SessionView component the desktop pane does, from
 * the same state, so what the two surfaces show cannot drift.
 */
export function Phone({ state }: PhoneProps): React.JSX.Element {
  return (
    <div
      aria-hidden={!state.phoneVisible}
      className={cn(
        'pointer-events-none absolute right-5 bottom-5 z-20 transition-[opacity,transform] duration-500 ease-out',
        state.phoneVisible
          ? 'translate-y-0 opacity-100'
          : '[visibility:hidden] translate-y-4 opacity-0'
      )}
    >
      <div className="relative">
        <span className="bg-rule-strong absolute top-[62px] -left-[2px] h-7 w-[2px]" />
        <span className="bg-rule-strong absolute top-[104px] -left-[2px] h-12 w-[2px]" />
        <span className="bg-rule-strong absolute top-[86px] -right-[2px] h-14 w-[2px]" />

        <div className="border-rule-strong bg-ink shadow-soft rounded-[26px] border p-[4px]">
          <div className="bg-page relative h-[318px] w-[170px] overflow-hidden rounded-[22px]">
            <span className="bg-ink absolute top-[8px] left-1/2 z-10 h-[14px] w-[46px] -translate-x-1/2 rounded-full" />

            <div className="flex h-full flex-col pt-[26px]">
              <div className="border-hairline text-faint flex shrink-0 items-center justify-between border-b px-2.5 pb-1.5 font-mono text-[9px]">
                <span className="text-ink">fix/scroll-jank</span>
                <span>MacBook Pro</span>
              </div>
              <div className="min-h-0 flex-1">
                <SessionView state={state} compact />
              </div>
            </div>

            {/* Touch point — the phone is the surface being driven. */}
            {state.touchOnPhone ? (
              <span
                aria-hidden="true"
                className="border-claude bg-claude/25 absolute bottom-[30px] left-1/2 size-7 -translate-x-1/2 rounded-full border-2 transition-opacity duration-200"
              />
            ) : null}

            <span className="bg-rule absolute bottom-[6px] left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
