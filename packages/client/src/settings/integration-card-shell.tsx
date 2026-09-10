import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'

import { useIntegrationCardShellClass } from './integration-card-presentation'

export type IntegrationCardStatusTone = 'connected' | 'attention' | 'neutral'

const STATUS_TONE_CLASSES: Record<IntegrationCardStatusTone, string> = {
  connected:
    'border-green-700/25 bg-green-700/10 text-green-700 dark:border-green-300/25 dark:bg-green-300/10 dark:text-green-300',
  attention: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  neutral: 'border-border bg-background text-muted-foreground'
}

export function IntegrationCardShell(props: {
  icon: React.ReactNode
  name: string
  description: React.ReactNode
  statusLabel: string
  statusTone: IntegrationCardStatusTone
  checking?: boolean
  className?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}): React.JSX.Element {
  const shellClass = useIntegrationCardShellClass(props.className)
  const status = props.checking ? (
    <LoadingIndicator className="text-muted-foreground size-4 shrink-0" />
  ) : (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        STATUS_TONE_CLASSES[props.statusTone]
      )}
    >
      {props.statusLabel}
    </span>
  )

  return (
    <div className={shellClass}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-muted-foreground shrink-0">{props.icon}</span>
        <div className="min-w-0 flex-1 basis-[16rem] space-y-0.5">
          <p className="text-sm font-medium">{props.name}</p>
          <p className="text-muted-foreground text-xs">{props.description}</p>
        </div>
        {/* Why: settings can be narrow with the sidebar open; controls need their
        own row before they squeeze provider copy into unreadable columns. */}
        <div className="flex shrink-0 basis-full flex-wrap items-center justify-start gap-1.5 min-[1100px]:ml-auto min-[1100px]:basis-auto min-[1100px]:justify-end">
          {props.actions}
          {status}
        </div>
      </div>
      {props.children}
    </div>
  )
}

export function IntegrationCardDetails(props: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('mt-4 space-y-2 border-t border-border/60 pt-4', props.className)}>
      {props.children}
    </div>
  )
}
