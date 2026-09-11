import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

function SplitRightIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      aria-hidden
    >
      <rect x={2.5} y={3} width={11} height={10} rx={1.4} />
      <path d="M8 3v10" />
    </svg>
  )
}

function SplitDownIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      aria-hidden
    >
      <rect x={2.5} y={3} width={11} height={10} rx={1.4} />
      <path d="M2.5 8h11" />
    </svg>
  )
}

export function CursorIcon(): JSX.Element {
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

export function ContextMenu({
  shown,
  splitRowActive,
  setSplitRow,
  splitRightShortcutLabel,
  splitDownShortcutLabel
}: {
  shown: boolean
  splitRowActive: boolean
  setSplitRow: (node: HTMLDivElement | null) => void
  splitRightShortcutLabel: string
  splitDownShortcutLabel: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'absolute left-[110px] top-[78px] z-10 min-w-[218px] origin-top-left border border-border bg-card p-1.5 font-sans text-[12px] text-foreground transition-[opacity,transform] duration-[160ms] ease-out',
        shown ? 'opacity-100' : '-translate-y-[3px] scale-[0.985] opacity-0'
      )}
      style={{ pointerEvents: 'none' }}
    >
      <CtxSkeleton width={70} />
      <CtxSkeleton width={56} />
      <CtxSeparator />
      <div
        ref={setSplitRow}
        className={cn(
          'grid h-[22px] grid-cols-[18px_1fr_auto] items-center gap-2 px-1.5 py-1 pl-1.5',
          splitRowActive ? 'bg-foreground/[0.07]  ' : null
        )}
      >
        <span className="text-muted-foreground inline-flex items-center justify-center">
          <SplitRightIcon />
        </span>
        <span className="leading-none whitespace-nowrap">
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.e370fa8c2b',
            'Split Terminal Right'
          )}
        </span>
        <span className="text-muted-foreground font-mono text-[11px]">
          {splitRightShortcutLabel}
        </span>
      </div>
      <div className="grid h-[22px] grid-cols-[18px_1fr_auto] items-center gap-2 px-1.5 py-1 pl-1.5">
        <span className="text-muted-foreground inline-flex items-center justify-center">
          <SplitDownIcon />
        </span>
        <span className="leading-none whitespace-nowrap">
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.ca2cfbf188',
            'Split Terminal Down'
          )}
        </span>
        <span className="text-muted-foreground font-mono text-[11px]">
          {splitDownShortcutLabel}
        </span>
      </div>
      <CtxSeparator />
      <CtxSkeleton width={64} />
      <CtxSkeleton width={48} />
    </div>
  )
}

function CtxSkeleton(props: { width: number }): JSX.Element {
  return (
    <div className="flex h-[18px] items-center px-2.5">
      <span className="bg-foreground/[0.16] block h-1.5" style={{ width: `${props.width}%` }} />
    </div>
  )
}

function CtxSeparator(): JSX.Element {
  return <div className="bg-foreground/[0.08] my-1 h-px" />
}
