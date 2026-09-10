import { CSPProvider } from '@base-ui/react/csp-provider'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { startBrowserTabProjectionBridge } from '../../browser-tab-projection/bridge'
import {
  installRendererCrashDiagnostics,
  recordRendererCrashBreadcrumb
} from '../../crash-report/diagnostics'
import { applyDocumentTheme } from '../../editor/document-theme'
import { I18nProvider } from '../../i18n/provider'
import { HugeiconsIconContextProvider } from '../../icons/context-provider'
import { ProjectCatalogProvider } from '../../project-catalog/provider'
import { startShellEventStream } from '../../runtime/shell-events-client'
import { getWorkbenchLocation, navigateWorkbench } from '../../runtime/workbench-location'
import { configureSidebarHostNavigation } from '../../sidebar/host-navigation'
import { openCommandPalette } from '../command-palette/open'
import { getExtensionHostNavigation } from '../navigation'
import { EXTENSION_QUERY_CACHE_KEY, extensionQueryCacheBuster } from '../runtime/query-cache'
import { ExtensionWorkbenchRouter } from './router'

export function mountExtensionWorkbench(runtimeQueryCacheBuster: string): void {
  recordRendererCrashBreadcrumb('extension_workbench_bootstrap_started', {
    dev: import.meta.env.DEV
  })
  startShellEventStream()
  startBrowserTabProjectionBridge()
  const extensionNavigation = getExtensionHostNavigation()
  configureSidebarHostNavigation({
    openPage: (page) => {
      if (page === 'search') {
        openCommandPalette()
        return
      }
      navigateWorkbench({ kind: 'page', page })
    },
    openWorkspace: (target) => {
      if (target.dedicated) {
        extensionNavigation.openWorkspace(target)
        return
      }
      const current = getWorkbenchLocation()
      const isSameWorkspace =
        current.kind === 'project' &&
        current.projectId === target.projectId &&
        (!target.worktreeId || !current.worktreeId || current.worktreeId === target.worktreeId)
      navigateWorkbench({
        kind: 'project',
        projectId: target.projectId,
        ...(isSameWorkspace && current.panel ? { panel: current.panel } : {}),
        ...(target.sessionId ? { sessionId: target.sessionId } : {}),
        ...(target.worktreeId
          ? { worktreeId: target.worktreeId }
          : isSameWorkspace && current.worktreeId
            ? { worktreeId: current.worktreeId }
            : {})
      })
    }
  })
  installRendererCrashDiagnostics()
  applyDocumentTheme('system', { disableTransitions: false })

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_workbench_root_missing')
  }
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 2, staleTime: 1_000 }
    }
  })

  createRoot(rootElement).render(
    <StrictMode>
      <CSPProvider disableStyleElements>
        <HugeiconsIconContextProvider>
          <I18nProvider>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{
                buster: extensionQueryCacheBuster(runtimeQueryCacheBuster),
                maxAge: 24 * 60 * 60 * 1_000,
                persister: createSyncStoragePersister({
                  key: EXTENSION_QUERY_CACHE_KEY,
                  storage: window.localStorage
                })
              }}
            >
              <ProjectCatalogProvider>
                <ExtensionWorkbenchRouter />
              </ProjectCatalogProvider>
            </PersistQueryClientProvider>
          </I18nProvider>
        </HugeiconsIconContextProvider>
      </CSPProvider>
    </StrictMode>
  )
  recordRendererCrashBreadcrumb('extension_workbench_bootstrap_rendered')
}
