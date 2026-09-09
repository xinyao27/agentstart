import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useState } from 'react'

import { SCROLLBACK_PRESETS_ROWS } from './constants'

export function useScrollbackMode(settings: GlobalSettings | null) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset')
  const [previousRows, setPreviousRows] = useState(settings?.terminalScrollbackRows)

  if (settings?.terminalScrollbackRows !== previousRows) {
    setPreviousRows(settings?.terminalScrollbackRows)
    if (settings) {
      setMode(
        SCROLLBACK_PRESETS_ROWS.includes(
          settings.terminalScrollbackRows as (typeof SCROLLBACK_PRESETS_ROWS)[number]
        )
          ? 'preset'
          : 'custom'
      )
    }
  }

  return [mode, setMode] as const
}
