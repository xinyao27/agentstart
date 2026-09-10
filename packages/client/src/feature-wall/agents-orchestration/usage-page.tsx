import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ClaudeIcon, OpenAIIcon } from '~renderer/status-bar/icons'
import { cn } from '~renderer/ui/class-names'

import './orchestration.css'

type Phase = 'reset' | 'expanded' | 'targeted' | 'swapped'

const EXPAND_DELAY = 2200
const TARGET_DELAY = 3400
const SWAP_DELAY = 4400
const LOOP_DELAY = 7800

export function UsagePage(props: { active: boolean; reducedMotion: boolean }): JSX.Element {
  return <UsageAnimation key={`${props.active}:${props.reducedMotion}`} {...props} />
}

function UsageAnimation(props: { active: boolean; reducedMotion: boolean }): JSX.Element {
  const { active, reducedMotion } = props
  const [phase, setPhase] = useState<Phase>(active && reducedMotion ? 'swapped' : 'reset')
  const [pulseKey, setPulseKey] = useState(0)

  useEffect(() => {
    if (!active || reducedMotion) {
      return
    }
    let cancelled = false
    const timeouts: number[] = []
    const at = (delay: number, fn: () => void): void => {
      timeouts.push(
        window.setTimeout(() => {
          if (!cancelled) {
            fn()
          }
        }, delay)
      )
    }
    const loop = (): void => {
      at(EXPAND_DELAY, () => setPhase('expanded'))
      at(TARGET_DELAY, () => setPhase('targeted'))
      at(SWAP_DELAY, () => {
        setPhase('swapped')
        setPulseKey((k) => k + 1)
      })
      at(LOOP_DELAY, () => {
        if (!cancelled) {
          setPhase('reset')
          loop()
        }
      })
    }
    loop()
    return () => {
      cancelled = true
      timeouts.forEach((id) => window.clearTimeout(id))
    }
  }, [active, reducedMotion])

  const swapped = phase === 'swapped'
  const expanded = phase === 'expanded' || phase === 'targeted' || phase === 'swapped'
  const targeted = phase === 'targeted' || phase === 'swapped'

  return (
    <div className="relative h-full w-full">
      <Popover expanded={expanded} targeted={targeted} swapped={swapped} pulseKey={pulseKey} />
      <BottomBar swapped={swapped} />
    </div>
  )
}

function Popover(props: {
  expanded: boolean
  targeted: boolean
  swapped: boolean
  pulseKey: number
}): JSX.Element {
  const { expanded, targeted, swapped, pulseKey } = props
  // Why: bars show % used (consumption), matching the live status-bar meter.
  const sessionPctText = swapped ? '0% used' : '96% used'
  const sessionResetText = swapped ? 'Resets in 5h' : 'Resets in 47m'
  const sessionFillWidth = swapped ? '0%' : '96%'
  const weeklyFillWidth = '38%'

  return (
    <div
      className={cn(
        'absolute z-10 flex flex-col gap-[7px] rounded-[10px] border bg-card px-3 py-2.5 not-italic',
        'border-border text-foreground'
      )}
      style={{ left: 40, bottom: 70, width: 320 }}
    >
      <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5">
        <span className="bg-foreground/[0.06] text-foreground inline-flex size-6 items-center justify-center rounded-[5px]">
          <span className="inline-flex" style={{ color: '#111' }}>
            <OpenAIIcon size={14} />
          </span>
        </span>
        <div>
          <div className="text-[13.5px] leading-[1.1] font-bold">
            {translate(
              'auto.components.feature.wall.agents.orchestration.UsagePage.6a4b1d3c38',
              'Codex'
            )}
          </div>
          <div className="text-muted-foreground text-[11px]">
            {translate(
              'auto.components.feature.wall.agents.orchestration.UsagePage.5e45fb1238',
              'Updated 1m ago'
            )}
          </div>
        </div>
      </div>

      <UsageBar
        title={translate(
          'auto.components.feature.wall.agents.orchestration.UsagePage.f421abf962',
          'Session'
        )}
        fillWidth={sessionFillWidth}
        warn={!swapped}
        metaLeft={
          <span
            key={`pct-${pulseKey}-${swapped ? 'on' : 'off'}`}
            className={cn(
              'font-semibold',
              swapped ? 'feature-wall-meta-pulse' : 'text-[rgb(220_38_38)]'
            )}
          >
            {sessionPctText}
          </span>
        }
        metaRight={<span>{sessionResetText}</span>}
      />
      <UsageBar
        title={translate(
          'auto.components.feature.wall.agents.orchestration.UsagePage.0470aaed99',
          'Weekly'
        )}
        fillWidth={weeklyFillWidth}
        warn={false}
        metaLeft={
          <span>
            {translate(
              'auto.components.feature.wall.agents.orchestration.UsagePage.05ce4ecdd3',
              '38% used'
            )}
          </span>
        }
        metaRight={
          <span>
            {translate(
              'auto.components.feature.wall.agents.orchestration.UsagePage.4dce5ca3aa',
              'Resets in 4d 3h'
            )}
          </span>
        }
      />
      <div className="bg-border h-px" />
      <div className="text-[11px] font-semibold">
        {translate(
          'auto.components.feature.wall.agents.orchestration.UsagePage.277a9c65a9',
          'Codex Account'
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <AccountNameSkeleton widthClassName={swapped ? 'w-24' : 'w-28'} />
        <span
          className={cn(
            'inline-flex items-center justify-center text-muted-foreground transition-transform duration-[240ms] ease-[cubic-bezier(.2,.8,.2,1)]',
            expanded ? 'rotate-90' : 'rotate-0'
          )}
          aria-hidden
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M3 2 L7 5 L3 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <div
        className={cn(
          '-mt-px grid transition-[grid-template-rows] duration-[280ms] ease-[cubic-bezier(.2,.8,.2,1)]',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="text-muted-foreground pt-1 pb-1 text-[10px] font-semibold tracking-[0.06em] uppercase">
            {translate(
              'auto.components.feature.wall.agents.orchestration.UsagePage.be5a165875',
              'Switch to'
            )}
          </div>
          <div className="border-border bg-foreground/[0.025] flex flex-col gap-0.5 rounded-lg border p-[3px]">
            <SwitchAccount
              accountWidthClassName="w-24"
              tag="Team"
              fillPct={0}
              metaText="0%"
              highlighted={targeted}
            />
            <SwitchAccount
              accountWidthClassName="w-32"
              tag={null}
              fillPct={22}
              metaText="22%"
              highlighted={false}
            />
          </div>
        </div>
      </div>
      <div
        className="border-border bg-card absolute bottom-[-5px] left-1/2 -ml-[5px] size-[10px] rotate-45 border-r border-b"
        aria-hidden
      />
    </div>
  )
}

function AccountNameSkeleton(props: { widthClassName: string }): JSX.Element {
  return (
    <span className={cn('block h-2.5 bg-foreground/[0.14] rounded-full', props.widthClassName)} />
  )
}

function UsageBar(props: {
  title: string
  fillWidth: string
  warn: boolean
  metaLeft: JSX.Element
  metaRight: JSX.Element
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[12px] font-semibold">{props.title}</div>
      <div className="bg-foreground/[0.08] h-1.5 w-full overflow-hidden rounded-full">
        <span
          className={cn(
            'block h-full transition-[width,background] duration-[800ms] ease-[cubic-bezier(.2,.8,.2,1)] rounded-full',
            props.warn ? 'bg-[rgb(239_68_68)]' : 'bg-[rgb(34_197_94)]'
          )}
          style={{ width: props.fillWidth }}
        />
      </div>
      <div className="text-muted-foreground flex justify-between font-mono text-[11px]">
        {props.metaLeft}
        {props.metaRight}
      </div>
    </div>
  )
}

function SwitchAccount(props: {
  accountWidthClassName: string
  tag: string | null
  fillPct: number
  metaText: string
  highlighted: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2.5 px-1.5 py-1 text-[11.5px] transition-colors duration-[160ms] rounded-md',
        props.highlighted ? 'bg-emerald-500/10' : 'bg-transparent'
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <AccountNameSkeleton widthClassName={props.accountWidthClassName} />
        {props.tag ? (
          <span className="bg-foreground/[0.06] text-muted-foreground shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-semibold tracking-[0.06em] uppercase">
            {props.tag}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="bg-foreground/[0.10] block h-1 w-11 overflow-hidden rounded-full">
          <span
            className="block h-full rounded-full bg-emerald-500"
            style={{ width: `${props.fillPct}%` }}
          />
        </span>
        <span className="text-muted-foreground min-w-7 text-right font-mono text-[10px]">
          {props.metaText}
        </span>
      </div>
    </div>
  )
}

// The 340px-wide light pill at the bottom of the panel that the popover tip
// points down to. Codex chip is the "active" one — it animates from a near-
// full red bar (% used) to an empty green bar after the account swap.
function BottomBar(props: { swapped: boolean }): JSX.Element {
  // Why: match live status-bar consumption meters (% used), same as the popover.
  const codexFillWidth = props.swapped ? '0%' : '96%'
  const codexFillColor = props.swapped ? 'rgb(34 197 94)' : 'rgb(239 68 68)'
  const codexMeta = props.swapped ? '0% used 5h · 4% used wk' : '96% used 47m'
  return (
    <div
      className="border-border bg-muted/60 absolute bottom-[22px] left-1/2 flex -translate-x-1/2 items-center gap-3.5 rounded-lg border px-3.5 py-1.5 text-[11px]"
      style={{ width: 340 }}
    >
      <div className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10.5px]">
        <ClaudeIcon size={12} />
        <span className="bg-foreground/[0.12] block h-1 w-9 overflow-hidden rounded-full">
          <span className="block h-full rounded-full bg-emerald-500" style={{ width: '29%' }} />
        </span>
        <span>
          {translate(
            'auto.components.feature.wall.agents.orchestration.UsagePage.64265cb295',
            '29% used 5h'
          )}
        </span>
      </div>
      <div className="bg-foreground/[0.06] text-foreground -my-0.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10.5px]">
        <span style={{ color: '#111' }}>
          <OpenAIIcon size={12} />
        </span>
        <span className="bg-foreground/[0.12] block h-1 w-9 overflow-hidden rounded-full">
          <span
            className="block h-full rounded-full transition-[width,background] duration-[600ms] ease-out"
            style={{ width: codexFillWidth, background: codexFillColor }}
          />
        </span>
        <span>{codexMeta}</span>
      </div>
    </div>
  )
}
