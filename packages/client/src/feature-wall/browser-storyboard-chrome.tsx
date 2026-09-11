import type { JSX, ReactNode } from 'react'
import { cn } from '~renderer/ui/class-names'

export function BrowserStoryboardTab(props: {
  icon: ReactNode
  title: string
  minimized?: boolean
  incoming?: boolean
}): JSX.Element {
  const { icon, title, minimized, incoming } = props
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 border border-b-0 border-border bg-card px-2.5 pb-1.5 pt-1 text-[11px] text-foreground',
        minimized ? 'gap-0 px-2' : null,
        incoming ? 'animate-[browserTabIn_320ms_cubic-bezier(.2,.8,.2,1)_both]' : null
      )}
      style={{ top: 1 }}
    >
      <span className="text-muted-foreground inline-flex size-3 items-center justify-center">
        {icon}
      </span>
      {minimized ? null : (
        <span className="text-foreground text-[11px] whitespace-nowrap">{title}</span>
      )}
    </span>
  )
}

export function BrowserStoryboardDropdownRow(props: { widthPct: number }): JSX.Element {
  return (
    <div
      className="grid items-center gap-2 px-2 py-[5px]"
      style={{ gridTemplateColumns: '18px 1fr' }}
    >
      <span className="bg-popover-foreground/10 size-[13px]" />
      <span className="bg-popover-foreground/10 h-[7px]" style={{ width: `${props.widthPct}%` }} />
    </div>
  )
}

export function BrowserStoryboardNavGlyph(props: { children: ReactNode }): JSX.Element {
  return (
    <span className="text-muted-foreground inline-flex size-[18px] items-center justify-center">
      {props.children}
    </span>
  )
}

export function BrowserStoryboardPlusGlyph(): JSX.Element {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function BrowserStoryboardTerminalGlyph(): JSX.Element {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m4 6 2.5 2L4 10" />
      <path d="M8.5 11h3.5" />
    </svg>
  )
}

export function BrowserStoryboardGlobeGlyph(): JSX.Element {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      aria-hidden
    >
      <circle cx={8} cy={8} r={5.5} />
      <path d="M2.5 8h11M8 2.5c2 1.7 2 9.3 0 11M8 2.5c-2 1.7-2 9.3 0 11" />
    </svg>
  )
}

export function BrowserStoryboardCursor(): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        d="M2 1.5 L2 12 L5 9 L7.2 14.5 L9.5 13.6 L7.3 8 L11.5 8 Z"
        fill="var(--background)"
        stroke="var(--foreground)"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  )
}
