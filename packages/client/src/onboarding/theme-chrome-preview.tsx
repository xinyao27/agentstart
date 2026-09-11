import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { cn } from '~renderer/ui/class-names'

export function ChromePreview({ variant }: { variant: GlobalSettings['theme'] }) {
  if (variant === 'system') {
    return (
      <div className="relative size-full">
        <div
          className="absolute inset-0"
          style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' }}
        >
          <ChromeMock dark />
        </div>
        <div
          className="absolute inset-0"
          style={{ clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)' }}
        >
          <ChromeMock dark={false} />
        </div>
        <div
          aria-hidden
          className="bg-border/70 absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
        />
      </div>
    )
  }
  return <ChromeMock dark={variant === 'dark'} />
}

function ChromeMock({ dark }: { dark: boolean }) {
  // Tiny AgentStart chrome: sidebar with two rows + a content area with a tab and
  // a composer line. Pure Tailwind so it stays lightweight inside the tile.
  // Why: the miniature preview must resolve the same semantic palette as the live
  // workbench, including the nested dark half of the system-theme preview.
  const sidebar = 'bg-sidebar'
  const sidebarBorder = 'border-sidebar-border'
  const row = 'bg-foreground/10'
  const rowDim = 'bg-foreground/5'
  const tab = 'bg-card border-border'
  const accent = 'bg-primary/80'
  return (
    <div className={cn('bg-background flex size-full', dark && 'dark')}>
      <div className={cn('flex w-[34%] flex-col gap-1 border-r p-1.5', sidebar, sidebarBorder)}>
        <div className={cn('h-1 w-7 rounded-sm', rowDim)} />
        <div className="mt-0.5 flex items-center gap-1">
          <span className={cn('size-1 rounded-full', accent)} />
          <span className={cn('h-1 flex-1 rounded-sm', row)} />
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('size-1 rounded-full', rowDim)} />
          <span className={cn('h-1 flex-1 rounded-sm', rowDim)} />
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('size-1 rounded-full', rowDim)} />
          <span className={cn('h-1 w-3/4 rounded-sm', rowDim)} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-1.5">
        <div className="flex gap-1">
          <div className={cn('h-2 w-8 rounded-sm border', tab)} />
          <div className={cn('h-2 w-5 rounded-sm', rowDim)} />
        </div>
        <div className="mt-1.5 flex-1 space-y-1">
          <div className={cn('h-1 w-full rounded-sm', rowDim)} />
          <div className={cn('h-1 w-5/6 rounded-sm', rowDim)} />
          <div className={cn('h-1 w-2/3 rounded-sm', rowDim)} />
        </div>
        <div className={cn('mt-1 flex h-2.5 items-center gap-1 rounded-sm border px-1', tab)}>
          <span className={cn('size-1 rounded-full', accent)} />
          <span className={cn('h-0.5 flex-1 rounded-sm', rowDim)} />
        </div>
      </div>
    </div>
  )
}
