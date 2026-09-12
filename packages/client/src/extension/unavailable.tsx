import '../assets/main.css'
import { CSPProvider } from '@base-ui/react/csp-provider'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { setRendererUiLanguage, translate } from '../i18n/i18n'
import { HugeiconsIconContextProvider } from '../icons/context-provider'
import { Button } from '../ui/button'
import { DaemonConnectionForm, type DaemonConnectionSettings } from './settings/connection-form'
import {
  extensionUnavailableGuidance,
  type ExtensionUnavailableReason
} from './unavailable-guidance'

export type { ExtensionUnavailableReason } from './unavailable-guidance'
export type { DaemonConnectionSettings } from './settings/connection-form'

export type ExtensionUnavailableFailure = {
  diagnostic: string
  reason: ExtensionUnavailableReason
}

export type ExtensionUnavailableActions = {
  connectionSettings?: {
    read: () => Promise<DaemonConnectionSettings>
    reset: () => Promise<void>
    save: (settings: DaemonConnectionSettings) => Promise<void>
  }
  diagnostic?: string
  requestLoopbackAccess?: () => Promise<void>
  retry?: () => Promise<ExtensionUnavailableFailure | null>
  retryDelayMs?: number
}

type ExtensionUnavailableProps = ExtensionUnavailableActions & {
  reason: ExtensionUnavailableReason
}

export function mountExtensionConnecting(): () => void {
  setRendererUiLanguage('system')
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_root_missing')
  }
  const root = createRoot(rootElement)
  let isMounted = true
  root.render(
    <CSPProvider disableStyleElements>
      <main className="bg-background text-foreground grid h-dvh place-items-center p-6">
        <div className="border-border bg-card w-full max-w-sm rounded-lg border p-5" role="status">
          <h1 className="text-base font-semibold">
            {translate('extension.runtime.connecting', 'Connecting to AgentStart…')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {translate(
              'extension.runtime.startingDaemon',
              'Starting the local daemon and restoring your workspace.'
            )}
          </p>
        </div>
      </main>
    </CSPProvider>
  )
  return () => {
    if (isMounted) {
      isMounted = false
      root.unmount()
    }
  }
}

export function mountExtensionUnavailable(
  reason: ExtensionUnavailableReason = 'unknown',
  actions: ExtensionUnavailableActions = {}
): () => void {
  setRendererUiLanguage('system')
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_root_missing')
  }
  const root = createRoot(rootElement)
  root.render(
    <CSPProvider disableStyleElements>
      <HugeiconsIconContextProvider>
        <ExtensionUnavailable reason={reason} {...actions} />
      </HugeiconsIconContextProvider>
    </CSPProvider>
  )
  return () => root.unmount()
}

function ExtensionUnavailable({
  connectionSettings,
  diagnostic,
  reason,
  requestLoopbackAccess,
  retry,
  retryDelayMs
}: ExtensionUnavailableProps): React.JSX.Element {
  const [accessState, setAccessState] = useState<'failed' | 'idle' | 'requesting'>('idle')
  const [copyState, setCopyState] = useState<'copied' | 'failed' | 'idle'>('idle')
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [connectionLoadState, setConnectionLoadState] = useState<'failed' | 'idle' | 'loading'>(
    'idle'
  )
  const [connectionSettingsRevision, setConnectionSettingsRevision] = useState(0)
  const [initialConnectionSettings, setInitialConnectionSettings] =
    useState<DaemonConnectionSettings | null>(null)
  const [failure, setFailure] = useState<ExtensionUnavailableFailure>({
    diagnostic: diagnostic ?? '',
    reason
  })
  const [retryCount, setRetryCount] = useState(0)
  const [retryState, setRetryState] = useState<'failed' | 'idle' | 'retrying'>('idle')

  const retryConnection = useCallback(async (): Promise<void> => {
    if (!retry || retryState === 'retrying') {
      return
    }
    setRetryState('retrying')
    try {
      const nextFailure = await retry()
      if (nextFailure) {
        setFailure(nextFailure)
        setRetryState('failed')
        setRetryCount((count) => count + 1)
      }
    } catch {
      setRetryState('failed')
      setRetryCount((count) => count + 1)
    }
  }, [retry, retryState])

  useEffect(() => {
    if (!retry || retryDelayMs === undefined) {
      return
    }
    const delayMs = Math.min(retryDelayMs * 2 ** retryCount, 15_000)
    const timer = window.setTimeout(() => void retryConnection(), delayMs)
    return () => window.clearTimeout(timer)
  }, [retry, retryConnection, retryCount, retryDelayMs, retryState])

  const requestAccess = async (): Promise<void> => {
    if (!requestLoopbackAccess) {
      return
    }
    setAccessState('requesting')
    try {
      await requestLoopbackAccess()
      await retryConnection()
    } catch {
      setAccessState('failed')
    }
  }

  const copyDiagnostic = async (): Promise<void> => {
    if (!failure.diagnostic) {
      return
    }
    try {
      await navigator.clipboard.writeText(failure.diagnostic)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const showConnectionSettings = async (): Promise<void> => {
    if (!connectionSettings) {
      return
    }
    setConnectionOpen(true)
    if (initialConnectionSettings || connectionLoadState === 'loading') {
      return
    }
    setConnectionLoadState('loading')
    try {
      setInitialConnectionSettings(await connectionSettings.read())
      setConnectionLoadState('idle')
    } catch {
      setConnectionLoadState('failed')
    }
  }

  return (
    <main className="bg-background text-foreground grid h-dvh place-items-center p-6">
      <div className="border-border bg-card max-h-[calc(100dvh-3rem)] max-w-sm overflow-y-auto rounded-lg border p-5">
        <h1 className="text-base font-semibold">
          {translate('extension.unavailable.title', 'AgentStart daemon is not available')}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {unavailableDescription(failure.reason)}
        </p>
        {failure.reason === 'missing-cli' ? (
          <pre className="bg-muted mt-3 overflow-x-auto rounded-md p-2 text-xs">
            bunx @agentstart/cli install
          </pre>
        ) : null}
        {failure.reason === 'loopback-check-failed' && requestLoopbackAccess ? (
          <div className="mt-4">
            <Button disabled={accessState === 'requesting'} onClick={() => void requestAccess()}>
              {accessState === 'requesting'
                ? translate('extension.unavailable.waitingForChrome', 'Waiting for Chrome…')
                : translate('extension.unavailable.checkLoopback', 'Check local connection')}
            </Button>
            {accessState === 'failed' ? (
              <p aria-live="polite" className="text-destructive mt-2 text-xs">
                {translate(
                  'extension.unavailable.loopbackCheckFailed',
                  'The local daemon is still unreachable. Make sure it is running, then check the address-bar permission and firewall settings.'
                )}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {retry ? (
            <Button disabled={retryState === 'retrying'} onClick={() => void retryConnection()}>
              {retryState === 'retrying'
                ? translate('extension.unavailable.retrying', 'Retrying…')
                : translate('extension.unavailable.retry', 'Retry now')}
            </Button>
          ) : null}
          {connectionSettings ? (
            <Button onClick={() => void showConnectionSettings()} variant="outline">
              {translate('extension.unavailable.connectionSettings', 'Connection settings')}
            </Button>
          ) : null}
        </div>
        {connectionOpen ? (
          <div className="border-border mt-4 border-t pt-4">
            {connectionLoadState === 'loading' ? (
              <p className="text-muted-foreground text-sm" role="status">
                {translate('extension.unavailable.loadingSettings', 'Loading connection settings…')}
              </p>
            ) : null}
            {connectionLoadState === 'failed' ? (
              <p className="text-destructive text-sm" role="alert">
                {translate(
                  'extension.unavailable.settingsFailed',
                  'Connection settings could not be loaded.'
                )}
              </p>
            ) : null}
            {initialConnectionSettings && connectionSettings ? (
              <DaemonConnectionForm
                initialSettings={initialConnectionSettings}
                key={connectionSettingsRevision}
                onReset={async () => {
                  await connectionSettings.reset()
                  setInitialConnectionSettings(await connectionSettings.read())
                  setConnectionSettingsRevision((revision) => revision + 1)
                  await retryConnection()
                }}
                onSave={async (settings) => {
                  await connectionSettings.save(settings)
                  await retryConnection()
                }}
                savedMessage={translate(
                  'extension.unavailable.connectionSaved',
                  'Saved. AgentStart will retry this connection.'
                )}
              />
            ) : null}
          </div>
        ) : null}
        {retry && retryDelayMs !== undefined && retryState !== 'retrying' ? (
          <p className="text-muted-foreground mt-2 text-xs" role="status">
            {translate(
              'extension.unavailable.automaticRetry',
              'AgentStart will retry automatically.'
            )}
          </p>
        ) : null}
        {retryState === 'failed' ? (
          <p aria-live="polite" className="text-destructive mt-2 text-xs">
            {translate(
              'extension.unavailable.retryFailed',
              'The connection still is not available. Check the guidance above and try again.'
            )}
          </p>
        ) : null}
        {failure.diagnostic ? (
          <details className="border-border mt-4 border-t pt-3 text-xs">
            <summary className="text-muted-foreground cursor-pointer select-none">
              {translate('extension.unavailable.diagnostic', 'Diagnostic details')}
            </summary>
            <pre className="bg-muted mt-2 max-h-32 overflow-auto rounded-md p-2 whitespace-pre-wrap">
              {failure.diagnostic}
            </pre>
            <Button
              className="mt-2"
              onClick={() => void copyDiagnostic()}
              size="sm"
              variant="outline"
            >
              {copyState === 'copied'
                ? translate('extension.unavailable.copied', 'Copied')
                : translate('extension.unavailable.copyDiagnostic', 'Copy diagnostic')}
            </Button>
            {copyState === 'failed' ? (
              <p aria-live="polite" className="text-destructive mt-2">
                {translate(
                  'extension.unavailable.copyFailed',
                  'Could not copy the diagnostic. Select the text above to copy it manually.'
                )}
              </p>
            ) : null}
          </details>
        ) : null}
      </div>
    </main>
  )
}

function unavailableDescription(reason: ExtensionUnavailableReason): string {
  const guidance = extensionUnavailableGuidance(reason)
  return translate(guidance.translationKey, guidance.fallback)
}
