import type { ReviewStepId } from '@yiru/protocol/telemetry/feature-wall/types'
import type { JSX } from 'react'

import { PANEL_HEIGHT, PANEL_WIDTH } from './review-animated-visual-shared'
import { ReviewNotesAnimatedVisual } from './review-notes-animated-visual'
import { ReviewPRViewAnimatedVisual } from './review-pr-view-animated-visual'
import { ReviewShipAnimatedVisual } from './review-ship-animated-visual'

// Why: thin dispatcher — picks the sub-step page. Each page renders its own
// scoped <style> tag. The `key` prop forces unmount/remount so each page's
// effect cleanup fires cleanly when the user flips between Notes, PR view,
// and Ship.
export function ReviewAnimatedVisual(props: {
  reducedMotion: boolean
  activeStepId: ReviewStepId
  widthPx?: number
}): JSX.Element {
  const { reducedMotion, activeStepId, widthPx } = props
  const scale = widthPx ? widthPx / PANEL_WIDTH : 1
  return (
    <div
      className="relative overflow-visible"
      style={{ width: widthPx ?? PANEL_WIDTH, height: PANEL_HEIGHT * scale }}
    >
      <div
        className="absolute top-0 left-1/2 origin-top"
        style={{
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
          transform: `translateX(-50%) scale(${scale})`
        }}
      >
        {activeStepId === 'notes' ? (
          <ReviewNotesAnimatedVisual key="notes" reducedMotion={reducedMotion} />
        ) : activeStepId === 'pr-view' ? (
          <ReviewPRViewAnimatedVisual key="pr-view" reducedMotion={reducedMotion} />
        ) : (
          <ReviewShipAnimatedVisual key="ship" reducedMotion={reducedMotion} />
        )}
      </div>
    </div>
  )
}
