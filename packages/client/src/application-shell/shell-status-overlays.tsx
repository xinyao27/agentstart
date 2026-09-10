import { Suspense } from 'react'

import { RecoverableRenderErrorBoundary } from '../error-boundaries/recoverable-render-error-boundary'
import { translate } from '../i18n/i18n'
import { StarNagAgentValueMomentObserver } from '../star-nag/agent-value-moment-observer'
import { StarNagCard } from '../star-nag/card'
import { StarNagToastHost } from '../star-nag/toast-host'
import { AgentStartRuntimeStatusOnlyFooter } from '../status-bar/runtime-status/segment'
import type { AppState } from '../store/types'
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
const StatusBar = lazy(() =>
  import('../status-bar/status-bar').then((module) => ({ default: module.StatusBar }))
)
type ShellStatusBarProps = {
  activeView: AppState['activeView']
  isVisible: boolean
}

export function ShellStatusBar({ activeView, isVisible }: ShellStatusBarProps): React.JSX.Element {
  if (!isVisible) {
    return <AgentStartRuntimeStatusOnlyFooter />
  }
  return (
    <Suspense
      fallback={<div className="border-border bg-background h-6 min-h-[24px] shrink-0 border-t" />}
    >
      <RecoverableRenderErrorBoundary
        boundaryId="overlay.status-bar"
        surface="overlay"
        resetKey={activeView}
        compact
        title={translate('auto.App.2e8ff36f94', 'The status bar hit an error.')}
        description={translate(
          'auto.App.8a023cea1f',
          'Retry the status bar to remount its controls.'
        )}
      >
        <StatusBar />
      </RecoverableRenderErrorBoundary>
    </Suspense>
  )
}

type ShellMiddleOverlaysProps = {
  activeView: AppState['activeView']
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
  activeView: AppState['activeView']
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
