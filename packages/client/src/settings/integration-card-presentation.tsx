import { createContext, useContext } from 'react'
import { cn } from '~renderer/ui/class-names'

type IntegrationCardPresentation = 'default' | 'setup-guide'

const IntegrationCardPresentationContext = createContext<IntegrationCardPresentation>('default')

function useIntegrationCardPresentation(): IntegrationCardPresentation {
  return useContext(IntegrationCardPresentationContext)
}

export function useIntegrationCardShellClass(className?: string): string {
  const presentation = useIntegrationCardPresentation()
  return cn(
    presentation === 'setup-guide'
      ? 'bg-transparent px-4 py-3'
      : 'rounded-xl border border-border bg-card px-4 py-3.5',
    className
  )
}

export function useIntegrationSubordinateRowClass(className?: string): string {
  const presentation = useIntegrationCardPresentation()
  return cn(
    presentation === 'setup-guide'
      ? 'border-t border-border/40 px-0 py-2 first:border-t-0'
      : 'rounded-md border border-border/50 bg-muted/50 px-3 py-2',
    className
  )
}

export function useIntegrationCommandRowClass(): string {
  const presentation = useIntegrationCardPresentation()
  return cn(
    'flex items-center gap-2 font-mono text-xs',
    presentation === 'setup-guide'
      ? 'border-t border-border/40 px-0 py-2'
      : 'rounded-md border border-border/50 bg-muted/50 px-3 py-2'
  )
}
