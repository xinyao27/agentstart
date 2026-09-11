import { cn } from 'cnfast'

import { TOTAL_MS } from './timeline'

export type ControlsProps = {
  playing: boolean
  elapsed: number
  onToggle: () => void
  onSeek: (ms: number) => void
  onReset: () => void
}

const buttonClasses =
  'text-faint hover:text-label font-mono text-[11px] underline decoration-transparent underline-offset-[3px] transition-colors hover:decoration-current'

export function Controls({
  playing,
  elapsed,
  onToggle,
  onSeek,
  onReset
}: ControlsProps): React.JSX.Element {
  const progress = TOTAL_MS === 0 ? 0 : Math.min(1, elapsed / TOTAL_MS)
  return (
    <div className="mt-2.5">
      {/* Why: the scrubber stays a hairline until hovered — it should read as a
          progress hint first and a control second. */}
      <div className="group/scrub relative h-3">
        <div className="bg-hairline absolute inset-x-0 top-1/2 h-px -translate-y-1/2" />
        <div
          className="bg-rule-strong group-hover/scrub:bg-claude absolute top-1/2 left-0 h-px -translate-y-1/2 transition-colors"
          style={{ width: `${progress * 100}%` }}
        />
        <span
          aria-hidden="true"
          className="bg-claude absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover/scrub:opacity-100"
          style={{ left: `${progress * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={TOTAL_MS}
          step={10}
          value={Math.round(elapsed)}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Demo progress"
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>

      <div className="mt-1.5 flex items-center gap-4">
        <button type="button" onClick={onToggle} className={buttonClasses}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={onReset} className={buttonClasses}>
          Replay
        </button>
        <span className={cn('text-faint ml-auto font-mono text-[10.5px] tabular-nums')}>
          {(elapsed / 1000).toFixed(1)}s / {(TOTAL_MS / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
