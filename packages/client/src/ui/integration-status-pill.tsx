import { Badge } from '~renderer/ui/badge'
import { cn } from '~renderer/ui/class-names'

export type IntegrationStatusTone = 'connected' | 'attention' | 'neutral'

const TONE_TO_BADGE: Record<
  IntegrationStatusTone,
  { variant: 'success' | 'warning' | 'outline'; dot: string }
> = {
  connected: { variant: 'success', dot: 'bg-emerald-500' },
  attention: { variant: 'warning', dot: 'bg-amber-500' },
  neutral: { variant: 'outline', dot: 'bg-muted-foreground' }
}

export function IntegrationStatusPill({
  tone,
  children
}: {
  tone: IntegrationStatusTone
  children: React.ReactNode
}): React.JSX.Element {
  const mapped = TONE_TO_BADGE[tone]
  return (
    <Badge variant={mapped.variant} size="xs" className="gap-1.5">
      <span className={cn('size-1.5 rounded-full', mapped.dot)} />
      {children}
    </Badge>
  )
}
