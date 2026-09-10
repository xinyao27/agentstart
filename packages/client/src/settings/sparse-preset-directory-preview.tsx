import { translate } from '~renderer/i18n/i18n'

export function SparsePresetDirectoryPreview({
  directories
}: {
  directories: string[]
}): React.JSX.Element {
  const visibleDirectories = directories.slice(0, 6)
  const hiddenCount = directories.length - visibleDirectories.length

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleDirectories.map((directory) => (
        <span
          key={directory}
          className="border-border/50 bg-muted/35 text-foreground/80 max-w-full min-w-0 truncate rounded-md border px-2 py-1 font-mono text-[11px]"
          title={directory}
        >
          {directory}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="border-border/50 bg-muted/35 text-muted-foreground rounded-md border px-2 py-1 text-[11px]">
          {translate(
            'auto.components.settings.SparsePresetSettingsSection.8b64731aaf',
            '+{{value0}} more',
            { value0: hiddenCount }
          )}
        </span>
      ) : null}
    </div>
  )
}
