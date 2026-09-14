import { Suspense } from 'react'

import { lazyWithRetry } from '../application-shell/lazy-with-retry'
import { RecoverableRenderErrorBoundary } from '../error-boundaries/recoverable-render-error-boundary'
import { translate } from '../i18n/i18n'

const StatusBar = lazyWithRetry(() =>
  import('./status-bar').then((module) => ({ default: module.StatusBar }))
)

// Why: the status bar lives at the bottom of the sidebar now, and this mount
// keeps its bundle lazy and its render crashes contained to the footer.
export function SidebarStatusFooter(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <RecoverableRenderErrorBoundary
        boundaryId="overlay.status-bar"
        compact
        surface="overlay"
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
