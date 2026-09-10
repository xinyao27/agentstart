import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type React from 'react'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useActiveWorktree } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { ThemeGradientPicker } from '~renderer/theme-gradient/picker'
import { resolveThemeGradient, type ThemeGradientScope } from '~renderer/theme-gradient/state'
import { Button } from '~renderer/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import { SettingsRow } from '../form-controls'

type ThemeColorScopeKind = ThemeGradientScope['kind']

type AppearanceThemeColorSectionProps = {
  themeMode: GlobalSettings['theme']
  onThemeModeChange: (theme: GlobalSettings['theme']) => void
}

function isThemeColorScopeKind(value: unknown): value is ThemeColorScopeKind {
  return value === 'workspace' || value === 'default'
}

export function AppearanceThemeColorSection({
  themeMode,
  onThemeModeChange
}: AppearanceThemeColorSectionProps): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const themeGradientDefault = useAppStore((s) => s.themeGradientDefault)
  const themeGradientsByWorkspaceId = useAppStore((s) => s.themeGradientsByWorkspaceId)
  const setThemeGradient = useAppStore((s) => s.setThemeGradient)
  const [requestedScope, setRequestedScope] = useState<ThemeColorScopeKind>('workspace')
  // Why: the workspace scope has nothing to edit until a workspace is open, so
  // it silently falls back rather than leaving the picker writing nowhere.
  const scopeKind: ThemeColorScopeKind = activeWorktree ? requestedScope : 'default'
  const scope: ThemeGradientScope =
    scopeKind === 'workspace' && activeWorktree
      ? { kind: 'workspace', workspaceId: activeWorktree.id }
      : { kind: 'default' }
  const theme =
    scope.kind === 'workspace'
      ? (themeGradientsByWorkspaceId[scope.workspaceId] ?? null)
      : themeGradientDefault
  const inheritedTheme = resolveThemeGradient(
    { themeGradientDefault, themeGradientsByWorkspaceId },
    activeWorktree?.id ?? null
  )

  return (
    <div className="space-y-1">
      <SettingsRow
        label={translate('themeGradient.scope.label', 'Applies to')}
        description={
          scope.kind === 'workspace'
            ? translate(
                'themeGradient.scope.workspaceDescription',
                'Only this workspace uses this theme. Others fall back to the default.'
              )
            : translate(
                'themeGradient.scope.defaultDescription',
                'Used by every workspace without a theme of its own.'
              )
        }
        control={
          <Select
            value={scopeKind}
            onValueChange={(next) => {
              if (isThemeColorScopeKind(next)) {
                setRequestedScope(next)
              }
            }}
          >
            <SelectTrigger size="sm" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspace" disabled={!activeWorktree}>
                {activeWorktree
                  ? translate('themeGradient.scope.workspace', 'This workspace: {{value0}}', {
                      value0: activeWorktree.displayName || activeWorktree.branch
                    })
                  : translate('themeGradient.scope.workspaceUnavailable', 'This workspace')}
              </SelectItem>
              <SelectItem value="default">
                {translate('themeGradient.scope.default', 'All workspaces (default)')}
              </SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <SettingsRow
        label={translate('themeGradient.system.label', 'Theme color')}
        description={translate(
          'themeGradient.system.description',
          'Without a custom palette, follow this computer’s accent color. Use the app default when unavailable.'
        )}
        control={
          <Button
            variant="outline"
            size="sm"
            disabled={theme === null}
            onClick={() => setThemeGradient(scope, null)}
          >
            {scope.kind === 'default'
              ? translate('themeGradient.system.follow', 'Follow system')
              : translate('themeGradient.system.useDefault', 'Use default color')}
          </Button>
        }
      />
      <ThemeGradientPicker
        theme={theme}
        themeMode={themeMode}
        onChange={(next) => setThemeGradient(scope, next)}
        onThemeModeChange={onThemeModeChange}
      />
      {scope.kind === 'workspace' && theme === null && inheritedTheme ? (
        <p className="text-muted-foreground text-xs">
          {translate(
            'themeGradient.scope.inheriting',
            'This workspace currently shows the default theme.'
          )}
        </p>
      ) : null}
    </div>
  )
}
