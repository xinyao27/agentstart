import App from '../../application-shell/shell'
import { RecoverableRenderErrorBoundary } from '../../error-boundaries/recoverable-render-error-boundary'
import { translate } from '../../i18n/i18n'
import { useUiLocale } from '../../i18n/use-ui-locale'
import type { WorkbenchLocation } from '../../runtime/workbench-location'
import { AgentPresence } from '../agent-status/presence'
import { CommandPalette } from '../command-palette/palette'
import { ConsoleSensorBridge } from '../context/console-bridge'
import { ProjectGroupCatalogBridge } from '../project-group-catalog'
import { DaemonCommandBridge } from '../runtime/command-bridge'
import { ConnectionStatus } from '../runtime/connection-status'
import { WorkspaceEventBridge } from '../runtime/event-bridge'
import { RuntimeSnapshotSurface } from '../runtime/snapshot-surface'
import { WorkspacePortClaimsBridge } from '../workspace-port-claims-bridge'
import { ExtensionWorkbenchLocationBridge } from './location'

export function ExtensionWorkbenchSurface({
  location
}: {
  location: WorkbenchLocation
}): React.JSX.Element {
  useUiLocale()
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="extension.workbench.root"
      surface="app-root"
      title={translate('app.recoverableError.rootTitle', 'AgentStart hit a renderer error.')}
      description={translate(
        'app.recoverableError.rootDescription',
        'The app shell could not finish rendering. Retry to remount it, or relaunch AgentStart if the error persists.'
      )}
    >
      <ConnectionStatus />
      <RuntimeSnapshotSurface>
        <AgentPresence />
        <ConsoleSensorBridge />
        <DaemonCommandBridge />
        <WorkspaceEventBridge />
        <WorkspacePortClaimsBridge />
        <ProjectGroupCatalogBridge />
        <CommandPalette includeWorkspaceFiles />
        <ExtensionWorkbenchLocationBridge location={location} />
        <App />
      </RuntimeSnapshotSurface>
    </RecoverableRenderErrorBoundary>
  )
}
