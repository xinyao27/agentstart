import '../../assets/main.css'
import { CSPProvider } from '@base-ui/react/csp-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'

import { setRendererUiLanguage } from '../../i18n/i18n'
import { HugeiconsIconContextProvider } from '../../icons/context-provider'
import type { ExtensionRuntimeHostFactory } from '../runtime/host'
import { configureExtensionRuntime } from '../runtime/session'
import { DevToolsPage } from './page'

export type DevToolsCapabilities = {
  evaluate: (expression: string) => Promise<unknown>
  readDiagnostics: () => Promise<DevToolsDiagnostic[]>
}

export type DevToolsDiagnostic = {
  detail: string
  id: string
  kind: 'console' | 'network'
  title: string
}

export function mountExtensionDevTools(
  runtimeHost: ExtensionRuntimeHostFactory,
  capabilities: DevToolsCapabilities
): void {
  setRendererUiLanguage('system')
  configureExtensionRuntime(runtimeHost)
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_devtools_root_missing')
  }
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } }
  })
  createRoot(rootElement).render(
    <CSPProvider disableStyleElements>
      <HugeiconsIconContextProvider>
        <QueryClientProvider client={queryClient}>
          <DevToolsPage capabilities={capabilities} />
        </QueryClientProvider>
      </HugeiconsIconContextProvider>
    </CSPProvider>
  )
}
