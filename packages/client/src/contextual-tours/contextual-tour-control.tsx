import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { Switch } from '~renderer/ui/switch'

import type { ContextualTourStepControl } from './catalog'
import { CONTEXTUAL_TOUR_ENABLE_AUTO_WORKSPACE_NAME_EVENT } from './contextual-tour-composer-events'

export function ContextualTourControl({
  control
}: {
  control: ContextualTourStepControl
}): JSX.Element | null {
  switch (control.kind) {
    case 'auto-rename-branch-from-work':
      return <AutoRenameBranchFromWorkControl />
  }
}

function toggleAutoRenameBranchFromWork(args: {
  enabled: boolean
  updateSettings: (settings: { autoRenameBranchFromWork: boolean }) => void | Promise<unknown>
  dispatchEvent: (event: Event) => void
}): void {
  const nextEnabled = !args.enabled
  void args.updateSettings({ autoRenameBranchFromWork: nextEnabled })
  if (nextEnabled) {
    args.dispatchEvent(new Event(CONTEXTUAL_TOUR_ENABLE_AUTO_WORKSPACE_NAME_EVENT))
  }
}

function AutoRenameBranchFromWorkControl(): JSX.Element {
  const enabled = useAppStore((s) => s.settings?.autoRenameBranchFromWork === true)
  const updateSettings = useAppStore((s) => s.updateSettings)

  return (
    <div className="border-border/70 bg-muted/35 mt-3 rounded-md border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-foreground text-xs font-medium">
            {translate(
              'auto.components.contextual.tours.ContextualTourControl.731c5573df',
              'Auto-name from first message'
            )}
          </div>
        </div>
        <Switch
          checked={enabled}
          aria-label={translate(
            'auto.components.contextual.tours.ContextualTourControl.186eecc34f',
            'Auto-name workspace from first agent message'
          )}
          onCheckedChange={() => {
            toggleAutoRenameBranchFromWork({
              enabled,
              updateSettings,
              dispatchEvent: (event) => window.dispatchEvent(event)
            })
          }}
        />
      </div>
    </div>
  )
}
