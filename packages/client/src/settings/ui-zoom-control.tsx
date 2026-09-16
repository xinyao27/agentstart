import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Minus, Plus, ArrowCounterClockwise as RotateCcw } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import { applyUIZoom } from '~renderer/settings/ui-zoom'
import { useAppStore } from '~renderer/store/state'

import { Button } from '../ui/button'
import { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, zoomLevelToPercent } from './constants'

export function UIZoomControl(): React.JSX.Element {
  const [zoomLevel, setZoomLevel] = useState(() => shellClient.ui.getZoomLevel())

  const applyZoom = (level: number) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level))
    applyUIZoom(clamped)
    setZoomLevel(clamped)
    void setRuntimeUIState(useAppStore.getState().settings, { uiZoomLevel: clamped }).catch(
      console.error
    )
  }

  const percent = zoomLevelToPercent(zoomLevel)

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => applyZoom(zoomLevel - ZOOM_STEP)}
        disabled={zoomLevel <= ZOOM_MIN}
      >
        <Minus className="size-3" />
      </Button>
      <span className="text-foreground w-14 text-center text-sm tabular-nums">{percent}%</span>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => applyZoom(zoomLevel + ZOOM_STEP)}
        disabled={zoomLevel >= ZOOM_MAX}
      >
        <Plus className="size-3" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => applyZoom(0)}
        disabled={zoomLevel === 0}
        className="ml-1 gap-1.5"
      >
        <RotateCcw className="size-3" />
        {translate('auto.components.settings.UIZoomControl.c2c64b24d0', 'Reset')}
      </Button>
    </div>
  )
}
