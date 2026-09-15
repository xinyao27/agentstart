import type React from 'react'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'

export function AiVaultPanelSurface({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    // Why: session ids and transcript excerpts are unbroken runs of text. The
    // wrap rule keeps their min-content width at zero so a narrow column can
    // actually shrink them instead of overflowing.
    <div className="bg-background text-foreground @container/ai-vault flex h-full min-h-0 w-full min-w-0 flex-col [overflow-wrap:anywhere]">
      {children}
    </div>
  )
}

export function AiVaultPanelNotice({
  children,
  loading = false,
  tone = 'muted'
}: {
  children: React.ReactNode
  loading?: boolean
  tone?: 'muted' | 'destructive'
}): React.JSX.Element {
  return (
    <div
      role={loading ? 'status' : undefined}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-[11px]',
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {loading ? <LoadingIndicator aria-hidden="true" className="size-3.5" /> : null}
      {children}
    </div>
  )
}
