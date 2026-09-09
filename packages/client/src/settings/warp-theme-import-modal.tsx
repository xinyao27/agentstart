import type { WarpThemeImportPreviewTheme } from '@yiru/protocol/terminal/theme-types'
import { translate } from '~renderer/i18n/i18n'
import { FolderOpen, FileArrowUp as FileUp } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { ScrollArea } from '../ui/scroll-area'
import { SettingsBadge } from './form-controls'
import type { UseWarpThemeImportReturn } from './use-warp-theme-import'

type WarpThemeImportModalProps = Pick<
  UseWarpThemeImportReturn,
  | 'open'
  | 'mode'
  | 'preview'
  | 'loading'
  | 'desktopOnly'
  | 'applyError'
  | 'selectedThemeIds'
  | 'handlePreviewSource'
  | 'handleToggleTheme'
  | 'handleToggleAll'
  | 'handleApply'
  | 'handleOpenChange'
>

function ThemeSwatches({ theme }: { theme: WarpThemeImportPreviewTheme }): React.JSX.Element {
  const colors = [
    theme.terminal.black,
    theme.terminal.red,
    theme.terminal.green,
    theme.terminal.yellow,
    theme.terminal.blue,
    theme.terminal.magenta,
    theme.terminal.cyan,
    theme.terminal.white
  ]
  return (
    <span className="border-border/60 flex shrink-0 overflow-hidden border">
      {colors.map((color, index) => (
        <span
          key={index}
          className="h-3 w-2.5"
          style={{ backgroundColor: color ?? 'transparent' }}
        />
      ))}
    </span>
  )
}

export function WarpThemeImportModal({
  open,
  mode,
  preview,
  loading,
  desktopOnly,
  applyError,
  selectedThemeIds,
  handlePreviewSource,
  handleToggleTheme,
  handleToggleAll,
  handleApply,
  handleOpenChange
}: WarpThemeImportModalProps): React.JSX.Element {
  const themes = preview?.themes ?? []
  const allSelected = themes.length > 0 && themes.every((theme) => selectedThemeIds.has(theme.id))
  const selectedCount = selectedThemeIds.size
  const skippedCount = preview?.skippedFiles.length ?? 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {mode === 'yaml'
              ? translate(
                  'auto.components.settings.WarpThemeImportModal.yaml_title',
                  'Import theme YAML'
                )
              : translate(
                  'auto.components.settings.WarpThemeImportModal.title',
                  'Import from Warp'
                )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === 'yaml'
              ? translate(
                  'auto.components.settings.WarpThemeImportModal.yaml_description',
                  'Import theme YAML files (Warp format) as Yiru terminal themes.'
                )
              : translate(
                  'auto.components.settings.WarpThemeImportModal.description',
                  'Import Warp themes as Yiru terminal themes.'
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!desktopOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={loading}
                onClick={() => void handlePreviewSource({ kind: 'chooseFile' })}
              >
                <FileUp className="size-4" />
                {translate(
                  'auto.components.settings.WarpThemeImportModal.choose_file',
                  'Choose File'
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={loading}
                onClick={() => void handlePreviewSource({ kind: 'chooseFolder' })}
              >
                <FolderOpen className="size-4" />
                {translate(
                  'auto.components.settings.WarpThemeImportModal.choose_folder',
                  'Choose Folder'
                )}
              </Button>
            </div>
          ) : null}

          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <LoadingIndicator className="size-4" />
              {translate(
                'auto.components.settings.WarpThemeImportModal.loading',
                'Loading Warp themes...'
              )}
            </div>
          ) : preview == null ? null : preview.found ? (
            <div className="space-y-3">
              <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  {preview.themes.length === 1
                    ? translate(
                        'auto.components.settings.WarpThemeImportModal.found_theme_one',
                        'Found 1 theme'
                      )
                    : translate(
                        'auto.components.settings.WarpThemeImportModal.found_theme_other',
                        'Found {{value0}} themes',
                        { value0: preview.themes.length }
                      )}
                  {preview.sourceLabel
                    ? translate(
                        'auto.components.settings.WarpThemeImportModal.found_in_source',
                        ' in {{value0}}',
                        { value0: preview.sourceLabel }
                      )
                    : ''}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  className="text-foreground focus-visible:bg-accent h-auto border-0 p-0 hover:underline"
                  onClick={() => handleToggleAll(!allSelected)}
                >
                  {allSelected
                    ? translate(
                        'auto.components.settings.WarpThemeImportModal.clear_all',
                        'Clear all'
                      )
                    : translate(
                        'auto.components.settings.WarpThemeImportModal.select_all',
                        'Select all'
                      )}
                </Button>
              </div>

              <div className="border-border/50 border">
                <ScrollArea className="h-72">
                  <div className="space-y-1 p-2">
                    {themes.map((theme) => {
                      const selected = selectedThemeIds.has(theme.id)
                      return (
                        <Button
                          variant="ghost"
                          size="default"
                          type="button"
                          key={theme.id}
                          aria-pressed={selected}
                          onClick={() => handleToggleTheme(theme.id)}
                          className={cn(
                            'border-0 justify-start whitespace-normal font-normal focus-visible:bg-accent',
                            'flex w-full gap-3 px-3 text-left transition-colors',
                            selected ? 'bg-accent text-accent-foreground' : ''
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center border text-[10px] leading-none',
                              selected
                                ? 'border-accent-foreground bg-accent-foreground text-accent'
                                : 'border-border bg-background'
                            )}
                          >
                            {selected ? '✓' : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium">{theme.name}</span>
                              {theme.mode !== 'unknown' ? (
                                <SettingsBadge tone="muted">{theme.mode}</SettingsBadge>
                              ) : null}
                            </div>
                            {theme.unsupportedFeatures?.length ? (
                              <p className="text-muted-foreground truncate text-xs">
                                {theme.unsupportedFeatures.join(', ')}
                              </p>
                            ) : (
                              <p className="text-muted-foreground text-xs">
                                {translate(
                                  'auto.components.settings.WarpThemeImportModal.colors_only',
                                  'Colors only'
                                )}
                              </p>
                            )}
                          </div>
                          <ThemeSwatches theme={theme} />
                        </Button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground space-y-2 text-xs">
              <p>
                {preview.error ??
                  (mode === 'yaml'
                    ? translate(
                        'auto.components.settings.WarpThemeImportModal.yaml_no_themes_found',
                        'No themes found in the selected files.'
                      )
                    : translate(
                        'auto.components.settings.WarpThemeImportModal.no_themes_found',
                        'No custom Warp themes found.'
                      ))}
              </p>
              {!preview.error && mode !== 'yaml' ? (
                <p>
                  {translate(
                    'auto.components.settings.WarpThemeImportModal.builtin_themes_hint',
                    "Warp's preloaded themes are part of the Warp app and can't be read from disk. Yiru already includes most of them, like Dracula, Gruvbox, Solarized, and Tokyo Night."
                  )}
                </p>
              ) : null}
              {!preview.error && mode !== 'yaml' ? (
                <p>
                  {translate(
                    'auto.components.settings.WarpThemeImportModal.custom_theme_yaml_hint',
                    "Custom and community themes need to exist as YAML files in a Warp themes folder before auto-import can find them. If you cloned Warp's public themes repo, use Choose Folder to import that checkout."
                  )}
                </p>
              ) : null}
              {!desktopOnly ? (
                <p>
                  {translate(
                    'auto.components.settings.WarpThemeImportModal.choose_manually',
                    'Choose a theme YAML file or folder to import manually.'
                  )}
                </p>
              ) : null}
            </div>
          )}

          {!loading && preview && skippedCount > 0 ? (
            <div className="border-border/50 border p-3">
              <p className="mb-2 text-xs font-medium">
                {translate(
                  'auto.components.settings.WarpThemeImportModal.skipped_files',
                  'Skipped files'
                )}
              </p>
              <ul className="scrollbar-sleek text-muted-foreground max-h-24 space-y-1 overflow-auto text-xs">
                {preview.skippedFiles.slice(0, 8).map((file) => (
                  <li key={`${file.label}:${file.reason}`} className="flex gap-2">
                    <span className="text-foreground/80 shrink-0 font-medium">{file.label}</span>
                    <span>{file.reason}</span>
                  </li>
                ))}
                {preview.skippedFiles.length > 8 ? (
                  <li>
                    {translate(
                      'auto.components.settings.WarpThemeImportModal.more_skipped_files',
                      '{{value0}} more skipped files.',
                      { value0: preview.skippedFiles.length - 8 }
                    )}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {applyError ? <p className="text-destructive text-xs">{applyError}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {translate('auto.components.settings.WarpThemeImportModal.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={!preview?.found || selectedCount === 0 || loading}
            onClick={() => void handleApply()}
          >
            {selectedCount === 1
              ? translate(
                  'auto.components.settings.WarpThemeImportModal.import_theme_one',
                  'Import 1 Theme'
                )
              : selectedCount > 0
                ? translate(
                    'auto.components.settings.WarpThemeImportModal.import_theme_other',
                    'Import {{value0}} Themes',
                    { value0: selectedCount }
                  )
                : translate(
                    'auto.components.settings.WarpThemeImportModal.import_themes',
                    'Import Themes'
                  )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
