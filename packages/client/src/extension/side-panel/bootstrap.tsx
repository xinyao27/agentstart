import { CSPProvider } from '@base-ui/react/csp-provider'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import {
  installRendererCrashDiagnostics,
  recordRendererCrashBreadcrumb
} from '../../crash-report/diagnostics'
import { applyDocumentTheme } from '../../editor/document-theme'
import { RecoverableRenderErrorBoundary } from '../../error-boundaries/recoverable-render-error-boundary'
import { setRendererUiLanguage, translate } from '../../i18n/i18n'
import { I18nProvider } from '../../i18n/provider'
import { useUiLocale } from '../../i18n/use-ui-locale'
import { HugeiconsIconContextProvider } from '../../icons/context-provider'
import { ProjectCatalogProvider } from '../../project-catalog/provider'
import { startShellEventStream } from '../../runtime/shell-events-client'
import { configureSidebarHostNavigation } from '../../sidebar/host-navigation'
import { ConfirmationDialogProvider } from '../../ui/confirmation-dialog'
import { Toaster } from '../../ui/sonner'
import { AgentPresence } from '../agent-status/presence'
import { openCommandPalette } from '../command-palette/open'
import { CommandPalette } from '../command-palette/palette'
import { ConsoleSensorBridge } from '../context/console-bridge'
import { getExtensionHostNavigation } from '../navigation'
import { ProjectGroupCatalogBridge } from '../project-group-catalog'
import { DaemonCommandBridge } from '../runtime/command-bridge'
import { ConnectionStatus } from '../runtime/connection-status'
import { WorkspaceEventBridge } from '../runtime/event-bridge'
import { EXTENSION_QUERY_CACHE_KEY, extensionQueryCacheBuster } from '../runtime/query-cache'
import { getExtensionRuntimeLabel, type ExtensionRuntimeBootstrap } from '../runtime/session'
import { RuntimeSnapshotSurface } from '../runtime/snapshot-surface'
import { prefetchExtensionWorkspace } from '../runtime/workspace-prefetch'
import { WorkspacePortClaimsBridge } from '../workspace-port-claims-bridge'
import { SidePanelSurface } from './surface'

export function mountExtensionSidePanel(bootstrap: ExtensionRuntimeBootstrap): void {
  recordRendererCrashBreadcrumb('extension_side_panel_bootstrap_started', {
    dev: import.meta.env.DEV
  })
  const navigation = getExtensionHostNavigation()
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 2, staleTime: 1_000 }
    }
  })
  configureSidebarHostNavigation({
    openPage: (page) => {
      if (page === 'search') {
        openCommandPalette()
        return
      }
      navigation.openPage(page)
    },
    openWorkspace: navigation.openWorkspace,
    prefetchWorkspace: (target) => {
      void prefetchExtensionWorkspace(queryClient, target.projectId)
    },
    runtimeLabel: getExtensionRuntimeLabel()
  })
  setRendererUiLanguage('system')
  startShellEventStream()
  installRendererCrashDiagnostics()
  applyDocumentTheme('system', { disableTransitions: false })

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_side_panel_root_missing')
  }

  createRoot(rootElement).render(
    <StrictMode>
      <CSPProvider disableStyleElements>
        <HugeiconsIconContextProvider>
          <I18nProvider>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{
                buster: extensionQueryCacheBuster(bootstrap),
                maxAge: 24 * 60 * 60 * 1_000,
                persister: createSyncStoragePersister({
                  key: EXTENSION_QUERY_CACHE_KEY,
                  storage: window.localStorage
                })
              }}
            >
              <ProjectCatalogProvider>
                <ProjectGroupCatalogBridge />
                <ConfirmationDialogProvider>
                  <SidePanelBoundary />
                </ConfirmationDialogProvider>
              </ProjectCatalogProvider>
            </PersistQueryClientProvider>
          </I18nProvider>
        </HugeiconsIconContextProvider>
      </CSPProvider>
    </StrictMode>
  )
  recordRendererCrashBreadcrumb('extension_side_panel_bootstrap_rendered')
}

function SidePanelBoundary(): React.JSX.Element {
  useUiLocale()
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="extension.side-panel.root"
      surface="app-root"
      title={translate('extension.sidePanel.errorTitle', 'Yiru side panel hit an error.')}
      description={translate(
        'extension.sidePanel.errorDescription',
        'Reconnect the Yiru daemon, then retry this panel.'
      )}
    >
      <ConnectionStatus />
      <RuntimeSnapshotSurface>
        <AgentPresence />
        <ConsoleSensorBridge />
        <DaemonCommandBridge />
        <WorkspaceEventBridge />
        <WorkspacePortClaimsBridge />
        <CommandPalette />
        <SidePanelSurface />
        <Toaster />
      </RuntimeSnapshotSurface>
    </RecoverableRenderErrorBoundary>
  )
}
