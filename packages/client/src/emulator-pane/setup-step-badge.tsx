import { Check } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'

export type StepState = 'pending' | 'done' | 'in-progress'

export function StepBadge({
  index,
  state
}: {
  index: number
  state: StepState
}): React.JSX.Element {
  if (state === 'done') {
    return (
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" />
      </div>
    )
  }
  if (state === 'in-progress') {
    return (
      <div className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
        <LoadingIndicator className="size-3.5" />
      </div>
    )
  }
  return (
    <div className="border-border/70 text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
      {index}
    </div>
  )
}
