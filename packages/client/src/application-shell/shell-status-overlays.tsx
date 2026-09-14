import type { TopLevelView } from '@agentstart/protocol/settings/ui-state'
import { Suspense } from 'react'

import { RecoverableRenderErrorBoundary } from '../error-boundaries/recoverable-render-error-boundary'
import { StarNagAgentValueMomentObserver } from '../star-nag/agent-value-moment-observer'
import { StarNagCard } from '../star-nag/card'
import { StarNagToastHost } from '../star-nag/toast-host'
import RecentTabSwitcher from '../tab-bar/recent-tab-switcher'
import { lazyWithRetry as lazy } from './lazy-with-retry'
import { TelemetryFirstLaunchSurface } from './telemetry-first-launch-surface'
import { ZoomOverlay } from './zoom-overlay'

const ContextualTourOverlay = lazy(() =>
  import('../contextual-tours/contextual-tour-overlay').then((module) => ({
    default: module.ContextualTourOverlay
  }))
)
const RemoteServerUpdateDialog = lazy(() => import('../settings/remote-server-update-dialog'))
const SkillFreshnessUpdateDialog = lazy(() =>
  import('../skills/skill-freshness-update-dialog').then((module) => ({
    default: module.SkillFreshnessUpdateDialog
  }))
)

type ShellMiddleOverlaysProps = {
  activeView: TopLevelView
  shouldMountContextualTourOverlay: boolean
  telemetryOptedIn: boolean | undefined
}

export function ShellMiddleOverlays({
  activeView,
  shouldMountContextualTourOverlay,
  telemetryOptedIn
}: ShellMiddleOverlaysProps): React.JSX.Element {
  return (
    <>
      {shouldMountContextualTourOverlay ? (
        <Suspense fallback={null}>
          <ContextualTourOverlay />
        </Suspense>
      ) : null}
      <RecoverableRenderErrorBoundary
        boundaryId="overlay.star-nag"
        surface="overlay"
        resetKey={activeView}
        compact
      >
        <StarNagCard />
      </RecoverableRenderErrorBoundary>
      <RecoverableRenderErrorBoundary
        boundaryId="overlay.star-nag-toast"
        surface="overlay"
        resetKey={activeView}
        compact
      >
        <StarNagToastHost />
      </RecoverableRenderErrorBoundary>
      <StarNagAgentValueMomentObserver />
      <RecoverableRenderErrorBoundary
        boundaryId="overlay.telemetry-first-launch"
        surface="overlay"
        resetKey={telemetryOptedIn ?? 'unknown'}
        compact
      >
        <TelemetryFirstLaunchSurface />
      </RecoverableRenderErrorBoundary>
      <RecoverableRenderErrorBoundary
        boundaryId="overlay.zoom"
        surface="overlay"
        resetKey={activeView}
        compact
      >
        <ZoomOverlay />
      </RecoverableRenderErrorBoundary>
    </>
  )
}

export function ShellTrailingOverlays({
  activeView
}: {
  activeView: TopLevelView
}): React.JSX.Element {
  return (
    <>
      <RecoverableRenderErrorBoundary
        boundaryId="overlay.recent-tab-switcher"
        surface="overlay"
        resetKey={activeView}
        compact
      >
        <RecentTabSwitcher />
      </RecoverableRenderErrorBoundary>
      <Suspense fallback={null}>
        <RecoverableRenderErrorBoundary
          boundaryId="overlay.skill-freshness-update-dialog"
          surface="overlay"
          compact
        >
          <SkillFreshnessUpdateDialog />
        </RecoverableRenderErrorBoundary>
        <RecoverableRenderErrorBoundary
          boundaryId="overlay.remote-server-update-dialog"
          surface="overlay"
          compact
        >
          <RemoteServerUpdateDialog />
        </RecoverableRenderErrorBoundary>
      </Suspense>
    </>
  )
}
