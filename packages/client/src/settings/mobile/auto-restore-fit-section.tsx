import { translate } from '~renderer/i18n/i18n'
import { DeviceMobile as Smartphone } from '~renderer/icons/hugeicons'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import { AUTO_RESTORE_FIT_OPTIONS, autoRestoreValueFromMs } from './auto-restore-options'

type MobileAutoRestoreFitSectionProps = {
  autoRestoreFitMs: number | null
  onAutoRestoreFitChange: (ms: number | null) => void
}

export function MobileAutoRestoreFitSection({
  autoRestoreFitMs,
  onAutoRestoreFitChange
}: MobileAutoRestoreFitSectionProps): React.JSX.Element {
  return (
    <div className="border-border/60 rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Smartphone className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">
          {translate(
            'auto.components.settings.MobilePane.ee56f1c7e4',
            'When you leave the mobile app'
          )}
        </span>
      </div>
      <p className="text-muted-foreground mb-3 text-xs">
        {translate(
          'auto.components.settings.MobilePane.35100bca5d',
          "While you're using a terminal on your phone, AgentStart shrinks it to fit your phone screen. When you close the app or switch away, this controls whether it stays at phone size (so interactive CLI tools don't reflow) or resizes back to your desktop. You can always use Restore this terminal or Restore all terminals on the banner to resize manually."
        )}
      </p>
      <Select
        value={autoRestoreValueFromMs(autoRestoreFitMs)}
        onValueChange={(v) => {
          const opt = AUTO_RESTORE_FIT_OPTIONS.find((o) => o.value === v)
          if (!opt) {
            return
          }
          onAutoRestoreFitChange(opt.ms)
        }}
      >
        <SelectTrigger size="sm" className="min-w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUTO_RESTORE_FIT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
