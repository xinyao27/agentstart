import { DEFAULT_REPO_BADGE_COLOR, REPO_COLORS } from '@yiru/protocol/project/appearance'
import { normalizeRepoBadgeColor } from '@yiru/protocol/project/appearance'
import { translate } from '~renderer/i18n/i18n'
import { RepoColorPicker } from '~renderer/repo/color-picker'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Label } from '~renderer/ui/label'

type RepositoryIconColorSectionProps = {
  badgeColor: string | null | undefined
  onBadgeColorChange: (color: string) => void
}

export function RepositoryIconColorSection({
  badgeColor,
  onBadgeColorChange
}: RepositoryIconColorSectionProps): React.JSX.Element {
  const selectedBadgeColor = normalizeRepoBadgeColor(badgeColor) ?? DEFAULT_REPO_BADGE_COLOR
  const isPresetBadgeColor = REPO_COLORS.some((color) => color === selectedBadgeColor)

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">
        {translate('auto.components.settings.RepositoryIconPicker.642dc29c6d', 'Color')}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        {REPO_COLORS.map((color) => (
          <Button
            variant="ghost"
            size="icon-xs"
            key={color}
            type="button"
            onClick={() => onBadgeColorChange(color)}
            aria-label={translate(
              'auto.components.settings.RepositoryIconPicker.2b7d27b93c',
              'Use {{value0}} repo color',
              { value0: color }
            )}
            aria-pressed={selectedBadgeColor === color}
            className={cn(
              'size-7 border transition-colors',
              selectedBadgeColor === color ? 'border-foreground' : 'hover:border-muted-foreground'
            )}
            style={{ backgroundColor: color }}
          />
        ))}
        <RepoColorPicker
          value={selectedBadgeColor}
          onChange={onBadgeColorChange}
          label={
            isPresetBadgeColor
              ? translate(
                  'auto.components.settings.RepositoryIconPicker.0e5f0693c1',
                  'Choose custom repo color'
                )
              : translate(
                  'auto.components.settings.RepositoryIconPicker.913c55833d',
                  'Custom repo color {{value0}}',
                  { value0: selectedBadgeColor }
                )
          }
          selected={!isPresetBadgeColor}
          triggerLabel="Custom"
          showHexInTrigger={!isPresetBadgeColor}
          className="h-7 px-2"
        />
      </div>
    </div>
  )
}
