import ghosttyIcon from '~renderer/assets/brand/ghostty.svg'
import { translate } from '~renderer/i18n/i18n'
import { Check } from '~renderer/icons/hugeicons'
import type { GhosttyImportPreview } from '~renderer/settings/import-preview'
import { Button } from '~renderer/ui/button'

import type { DiscoveryState } from './theme-step'

export function GhosttyDiscoveryRow({
  discovery,
  importing,
  disabled,
  onImport
}: {
  discovery: DiscoveryState
  importing: boolean
  disabled: boolean
  onImport: (preview: GhosttyImportPreview) => void
}) {
  // Why: 'idle' is the pre-effect state that persists on non-Mac (the
  // discovery effect short-circuits there), so render nothing instead of
  // showing the dashed-border "Looking for a Ghostty config..." placeholder.
  if (discovery.status === 'absent' || discovery.status === 'idle') {
    return null
  }

  if (discovery.status === 'detecting') {
    return (
      <div className="border-border text-muted-foreground flex items-center gap-2.5 border border-dashed bg-transparent px-3.5 py-2.5 text-[12px]">
        <span className="bg-muted-foreground/60 size-1.5 animate-pulse" />
        {translate(
          'auto.components.onboarding.ThemeStep.2c3aa538f8',
          'Looking for a Ghostty config...'
        )}
      </div>
    )
  }

  if (discovery.status === 'imported') {
    return (
      <div className="text-foreground flex items-center gap-2.5 border border-emerald-500/30 bg-emerald-500/[0.07] px-3.5 py-2.5 text-[12px]">
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="flex-1">
          <span className="font-medium">
            {translate('auto.components.onboarding.ThemeStep.78b6386140', 'Imported from Ghostty.')}
          </span>
          {discovery.fields.length > 0 && (
            <span className="text-muted-foreground"> {discovery.fields.join(' · ')}</span>
          )}
        </span>
      </div>
    )
  }

  const { preview, fields } = discovery
  return (
    <div className="border-primary/30 bg-primary/[0.06] flex items-center gap-3 border px-3.5 py-2.5">
      <img src={ghosttyIcon} alt="" className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[12px]">
          <span className="font-medium">
            {translate(
              'auto.components.onboarding.ThemeStep.7ee9234e54',
              'Ghostty config detected.'
            )}
          </span>{' '}
          <span className="text-muted-foreground">
            {translate('auto.components.onboarding.ThemeStep.248c812283', 'Import')}{' '}
            {fields.length > 0
              ? fields.map((f) => f.toLowerCase()).join(', ')
              : translate('auto.components.onboarding.ThemeStep.906c4373fe', 'settings')}
            ?
          </span>
        </div>
        {preview.configPath && (
          <div
            className="text-muted-foreground mt-0.5 truncate font-mono text-[10.5px]"
            title={preview.configPath}
          >
            {preview.configPath}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="bg-foreground text-background hover:bg-foreground/90 focus-visible:bg-foreground/90 py-1.5 text-[11.5px] font-semibold"
        disabled={importing || disabled}
        onClick={() => onImport(preview)}
      >
        {importing
          ? translate('auto.components.onboarding.ThemeStep.ad19e5c916', 'Importing...')
          : translate('auto.components.onboarding.ThemeStep.248c812283', 'Import')}
      </Button>
    </div>
  )
}
