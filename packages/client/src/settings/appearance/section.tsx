import type React from 'react'
import { CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

type AppearanceSectionProps = {
  /** Stable id used for the accordion toggle + aria wiring. */
  id: string
  icon: React.ReactNode
  title: React.ReactNode
  /** Plain-language current value shown in the collapsed summary row. */
  summary: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

/** Compact summary row that expands its section inline. The parent owns the
 *  open state so opening one row can collapse the previously open one
 *  (accordion behavior) and search can force a section open. */
export function AppearanceSection({
  id,
  icon,
  title,
  summary,
  open,
  onToggle,
  children
}: AppearanceSectionProps): React.JSX.Element {
  const contentId = `appearance-section-${id}`
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/50 bg-card transition-colors',
        open && 'border-ring/40'
      )}
    >
      <Button
        variant="ghost"
        size="default"
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className="hover:bg-accent/15 flex h-auto w-full justify-start gap-3.5 border-0 py-3.5 text-left font-normal whitespace-normal transition-colors"
      >
        <span className="bg-secondary text-foreground grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {!open ? (
            <span className="text-muted-foreground block truncate text-xs">{summary}</span>
          ) : null}
        </span>
        <ChevronRight
          className={cn(
            'size-[18px] shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90 text-foreground'
          )}
        />
      </Button>
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows,opacity,border-color] duration-200 ease-out motion-reduce:transition-none',
          open
            ? 'grid-rows-[1fr] border-t border-border/50 opacity-100'
            : 'grid-rows-[0fr] border-t border-transparent opacity-0'
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div id={contentId} role="region" className="px-4 pt-1 pb-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
