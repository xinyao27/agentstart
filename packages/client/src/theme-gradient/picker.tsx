import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import {
  createEmptyThemeGradient,
  type ThemeGradientTheme
} from '@yiru/protocol/settings/theme-gradient'
import type React from 'react'

import { ThemeGradientIntensityControl } from './intensity-control'
import { ThemeGradientPad } from './pad'
import { ThemeGradientPresets } from './presets'
import { ThemeGradientTextureDial } from './texture-dial'

type ThemeGradientPickerProps = {
  theme: ThemeGradientTheme | null
  themeMode: GlobalSettings['theme']
  onChange: (theme: ThemeGradientTheme | null) => void
  onThemeModeChange: (theme: GlobalSettings['theme']) => void
}

export function ThemeGradientPicker({
  theme,
  themeMode,
  onChange,
  onThemeModeChange
}: ThemeGradientPickerProps): React.JSX.Element {
  const workingTheme = theme ?? createEmptyThemeGradient()
  const isMac = navigator.userAgent.includes('Mac')

  return (
    <div data-theme-color-picker className="mx-auto flex w-[380px] max-w-full flex-col gap-2.5">
      <div className="flex justify-center">
        <ThemeGradientPad
          theme={workingTheme}
          themeMode={themeMode}
          onChange={onChange}
          onThemeModeChange={onThemeModeChange}
        />
      </div>

      <ThemeGradientPresets theme={theme} onSelect={onChange} />

      <div className={isMac ? 'flex items-center gap-8 px-2.5' : 'flex items-center gap-6 px-2.5'}>
        <ThemeGradientIntensityControl
          value={workingTheme.opacity}
          onChange={(opacity) => onChange({ ...workingTheme, opacity })}
        />
        <ThemeGradientTextureDial
          value={workingTheme.texture}
          onChange={(texture) => onChange({ ...workingTheme, texture })}
        />
      </div>
    </div>
  )
}
