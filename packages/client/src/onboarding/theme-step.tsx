import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { DiscoveryStatusEmitted } from '@yiru/protocol/telemetry/events/onboarding-product'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { Check, Monitor, Moon, GearSix as Settings2, Sun } from '~renderer/icons/hugeicons'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { previewGhosttyImportOnActiveHost } from '~renderer/runtime/settings-import-client'
import type { GhosttyImportPreview } from '~renderer/settings/import-preview'
import { track } from '~renderer/telemetry/client'
import { Button } from '~renderer/ui/button'

import { GhosttyDiscoveryRow } from './ghostty-discovery-row'
import { ChromePreview } from './theme-chrome-preview'

type ThemeStepProps = {
  theme: GlobalSettings['theme']
  onThemeChange: (theme: GlobalSettings['theme']) => void
  settings: GlobalSettings | null
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
}

export function applyOnboardingThemeSelection(
  id: GlobalSettings['theme'],
  onThemeChange: (theme: GlobalSettings['theme']) => void,
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
): void {
  onThemeChange(id)
  // Why: later onboarding controls also save settings. Persist the theme at
  // selection time so those unrelated writes cannot reapply the old theme.
  void updateSettings({ theme: id })
}

// Why: UI-only idle and detecting states must not become discovery telemetry events.
export type DiscoveryState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'found'; preview: GhosttyImportPreview; fields: string[] }
  | { status: 'imported'; fields: string[] }
  | { status: 'absent' }
type _DiscoveryStatusEmittedSync =
  Exclude<DiscoveryState['status'], 'idle' | 'detecting'> extends DiscoveryStatusEmitted
    ? DiscoveryStatusEmitted extends Exclude<DiscoveryState['status'], 'idle' | 'detecting'>
      ? true
      : never
    : never
const _discoveryStatusEmittedSyncCheck: _DiscoveryStatusEmittedSync = true
void _discoveryStatusEmittedSyncCheck

function fieldGroupCountBucket(count: number): '0' | '1-3' | '4-7' | '8+' {
  if (count <= 0) {
    return '0'
  }
  if (count <= 3) {
    return '1-3'
  }
  if (count <= 7) {
    return '4-7'
  }
  return '8+'
}

export function ThemeStep({ theme, onThemeChange, settings, updateSettings }: ThemeStepProps) {
  const [importing, setImporting] = useState(false)
  const shouldDetectGhostty = navigator.userAgent.includes('Mac')
  const [discovery, setDiscovery] = useState<DiscoveryState>(
    shouldDetectGhostty ? { status: 'detecting' } : { status: 'idle' }
  )
  const mountedRef = useMountedRef()

  // Why: read-only IPC. Auto-detect on step mount so the user sees a clear
  // "we found your Ghostty config" prompt instead of a buried Import button.
  // Settings are not applied until the user clicks Import (per design doc).
  useEffect(() => {
    // Why: Ghostty config-import is darwin-only (see src/main/ghostty/discovery.ts).
    // Skip the IPC + telemetry emission entirely on non-Mac so the
    // `_discovered: absent` rate measured by the Mac-cohort dashboard isn't
    // polluted by a population that cannot have a Ghostty config.
    if (!shouldDetectGhostty) {
      return
    }
    let cancelled = false
    void previewGhosttyImportOnActiveHost()
      .then((preview) => {
        if (cancelled) {
          return
        }
        // Why: hide the row when there's nothing to import. An empty diff can
        // mean "settings already match" *or* "every key in the config was
        // unsupported by the mapper" (e.g. theme = some-named-theme); we can't
        // tell, so don't make a claim either way.
        if (!preview.found || Object.keys(preview.diff).length === 0) {
          setDiscovery({ status: 'absent' })
          track('onboarding_ghostty_discovered', {
            state: 'absent',
            field_group_count_bucket: '0'
          })
          return
        }
        const fields = humanFields(preview.diff)
        setDiscovery({ status: 'found', preview, fields })
        track('onboarding_ghostty_discovered', {
          state: 'found',
          field_group_count_bucket: fieldGroupCountBucket(fields.length)
        })
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setDiscovery({ status: 'absent' })
        track('onboarding_ghostty_discovered', {
          state: 'absent',
          field_group_count_bucket: '0'
        })
      })
    return () => {
      cancelled = true
    }
  }, [shouldDetectGhostty])

  const importGhostty = async (preview: GhosttyImportPreview) => {
    if (!settings || importing) {
      return
    }
    // Why: track AFTER the busy guard so a double-click during an in-flight
    // import doesn't inflate the click counter when no second import attempt
    // actually proceeds.
    track('onboarding_ghostty_import_clicked', {})
    setImporting(true)
    try {
      const resolved = preview.found ? preview : await previewGhosttyImportOnActiveHost()
      if (!resolved.found || Object.keys(resolved.diff).length === 0) {
        if (mountedRef.current) {
          toast.info(
            translate(
              'auto.components.onboarding.ThemeStep.16a9f0446a',
              'No Ghostty settings found to import'
            )
          )
        }
        track('onboarding_ghostty_import_failed', { reason: 'empty_diff' })
        return
      }
      await updateSettings({
        ...resolved.diff,
        ...(resolved.diff.terminalColorOverrides
          ? {
              terminalColorOverrides: {
                ...settings.terminalColorOverrides,
                ...resolved.diff.terminalColorOverrides
              }
            }
          : {})
      })
      // Why: parent controller holds local `theme` state that overwrites
      // settings.theme on Continue; sync it so the import isn't clobbered.
      if (resolved.diff.theme && mountedRef.current) {
        onThemeChange(resolved.diff.theme)
      }
      const importedFields = humanFields(resolved.diff)
      if (mountedRef.current) {
        setDiscovery({ status: 'imported', fields: importedFields })
      }
      track('onboarding_ghostty_discovered', {
        state: 'imported',
        field_group_count_bucket: fieldGroupCountBucket(importedFields.length)
      })
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.onboarding.ThemeStep.699ddf83c2',
            'Failed to import Ghostty settings'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
      }
      track('onboarding_ghostty_import_failed', { reason: 'unknown' })
    } finally {
      if (mountedRef.current) {
        setImporting(false)
      }
    }
  }

  const themes: {
    id: GlobalSettings['theme']
    label: string
    hint: string
    icon: typeof Monitor
  }[] = [
    {
      id: 'system',
      label: translate('auto.components.onboarding.ThemeStep.827ea7b4a2', 'System'),
      hint: 'Match OS',
      icon: Monitor
    },
    {
      id: 'dark',
      label: translate('auto.components.onboarding.ThemeStep.fa7b673ea9', 'Dark'),
      hint: 'Easy on the eyes',
      icon: Moon
    },
    {
      id: 'light',
      label: translate('auto.components.onboarding.ThemeStep.ad192706e6', 'Light'),
      hint: 'Bright & crisp',
      icon: Sun
    }
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {themes.map(({ id, label, hint, icon: Icon }) => {
          const selected = theme === id
          return (
            <Button
              variant="choice-card"
              size="choice-card"
              key={id}
              className="overflow-hidden"
              aria-pressed={selected}
              onClick={() => applyOnboardingThemeSelection(id, onThemeChange, updateSettings)}
            >
              <div className="border-border relative mb-3 h-24 w-full overflow-hidden border">
                <ChromePreview variant={id} />
                {selected && (
                  <div className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid size-5 place-items-center">
                    <Check className="size-3" />
                  </div>
                )}
              </div>
              <div className="flex w-full min-w-0 items-baseline justify-between gap-2">
                <div className="text-foreground flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <Icon className="text-muted-foreground size-3.5" />
                  <span className="truncate">{label}</span>
                </div>
                <div className="text-muted-foreground shrink-0 text-[11px]">{hint}</div>
              </div>
            </Button>
          )
        })}
      </div>

      <GhosttyDiscoveryRow
        discovery={discovery}
        importing={importing}
        disabled={!settings}
        onImport={importGhostty}
      />

      <div className="text-muted-foreground flex items-center gap-2 px-1 text-[12px]">
        <Settings2 className="size-3.5" />
        <span>
          {translate(
            'auto.components.onboarding.ThemeStep.dd5c16ad1b',
            'More terminal options, including font, cursor, and palette, in'
          )}{' '}
          <span className="text-foreground font-medium">
            {translate('auto.components.onboarding.ThemeStep.94b9dc561d', 'Settings → Terminal')}
          </span>
        </span>
      </div>
    </div>
  )
}

function humanFields(diff: Partial<GlobalSettings>): string[] {
  // Why: chip labels are a friendly summary, not a strict 1:1 of mapper keys.
  // Group related diff keys (font weight + family + size → "Font") so the row
  // stays tidy. Anything in the diff that doesn't match a label still gets
  // imported; it just isn't surfaced as a chip.
  const groups: { label: string; keys: (keyof GlobalSettings)[] }[] = [
    {
      label: translate('auto.components.onboarding.ThemeStep.cc1858e19e', 'Font'),
      keys: ['terminalFontFamily', 'terminalFontSize', 'terminalFontWeight']
    },
    {
      label: translate('auto.components.onboarding.ThemeStep.ab2a583a97', 'Cursor'),
      keys: ['terminalCursorStyle', 'terminalCursorBlink', 'terminalCursorOpacity']
    },
    {
      label: translate('auto.components.onboarding.ThemeStep.c021e9dddd', 'Theme palette'),
      keys: ['terminalThemeDark', 'terminalThemeLight']
    },
    {
      label: translate('auto.components.onboarding.ThemeStep.06a24f4f2d', 'Colors'),
      keys: ['terminalColorOverrides']
    },
    {
      label: translate('auto.components.onboarding.ThemeStep.86c0f1caa2', 'Padding'),
      keys: ['terminalPaddingX', 'terminalPaddingY']
    },
    {
      label: translate('auto.components.onboarding.ThemeStep.b3a99a2d29', 'Window'),
      keys: ['terminalBackgroundOpacity', 'terminalInactivePaneOpacity']
    },
    {
      label: translate('auto.components.onboarding.ThemeStep.8ca01945f2', 'Dividers'),
      keys: ['terminalDividerColorDark', 'terminalDividerColorLight']
    },
    {
      label: translate('auto.components.onboarding.ThemeStep.6c51398942', 'Mouse'),
      keys: ['terminalMouseHideWhileTyping', 'terminalFocusFollowsMouse']
    },
    {
      label: translate('auto.components.onboarding.ThemeStep.a4b254779d', 'macOS Option key'),
      keys: ['terminalMacOptionAsAlt']
    }
  ]
  return groups.filter(({ keys }) => keys.some((k) => k in diff)).map(({ label }) => label)
}
