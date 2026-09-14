import type { CSSProperties } from 'react'
import { translate } from '~renderer/i18n/i18n'

import type { TabDropZone } from './use-tab-drag-split'

function getOverlayStyle(zone: TabDropZone): CSSProperties {
  switch (zone) {
    case 'up':
      return { top: 0, left: 0, width: '100%', height: '50%' }
    case 'down':
      return { top: '50%', left: 0, width: '100%', height: '50%' }
    case 'left':
      return { top: 0, left: 0, width: '50%', height: '100%' }
    case 'right':
      return { top: 0, left: '50%', width: '50%', height: '100%' }
    case 'center':
      return { inset: 0 }
  }
}

export default function TabGroupDropOverlay({
  zone,
  showPaneColumnLabel = false,
  fillContainer = false
}: {
  zone: TabDropZone
  showPaneColumnLabel?: boolean
  /** When the parent already sizes the overlay to the target region. */
  fillContainer?: boolean
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-[9999] border-2 border-blue-500/50 bg-blue-500/20"
      style={fillContainer ? { inset: 0 } : getOverlayStyle(zone)}
    >
      {showPaneColumnLabel && zone !== 'center' ? (
        <span className="bg-chart-2/20 text-foreground pointer-events-none absolute bottom-2 left-2 px-1.5 py-0.5 text-[11px] font-medium">
          {translate('auto.components.tab.group.TabGroupDropOverlay.paneColumnLabel', 'New split')}
        </span>
      ) : null}
    </div>
  )
}
