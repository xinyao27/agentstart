import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'

const BROWSER_AI_QUERY_KEY = ['extension-host', 'browser-ai'] as const

export function BrowserAiSettings(): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: BROWSER_AI_QUERY_KEY,
    queryFn: capabilities.readOnDeviceAiStatus
  })
  const toggle = useMutation({
    mutationFn: async () => {
      await capabilities.setOnDeviceAiEnabled(!(status.data?.enabled ?? false))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BROWSER_AI_QUERY_KEY })
    }
  })
  return (
    <section className="border-border mt-5 border p-4">
      <h2 className="font-medium">
        {translate('extension.browserSettings.browserAi', 'On-device summaries')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {translate(
          'extension.browserSettings.browserAiDescription',
          "Use Chrome's local Summarizer for optional activity digests. AgentStart always falls back to a deterministic summary."
        )}
      </p>
      <p className="text-muted-foreground mt-2 text-xs">
        {availabilityLabel(status.data?.availability ?? 'unavailable')}
      </p>
      <Button
        type="button"
        size="xs"
        className="mt-3"
        variant={status.data?.enabled ? 'default' : 'outline'}
        disabled={toggle.isPending || status.data?.availability === 'unavailable'}
        onClick={() => toggle.mutate()}
      >
        {status.data?.enabled
          ? translate('extension.browserSettings.disableBrowserAi', 'Disable local summaries')
          : translate('extension.browserSettings.enableBrowserAi', 'Enable local summaries')}
      </Button>
      {toggle.isError ? (
        <p className="text-destructive mt-2 text-xs">
          {translate(
            'extension.browserSettings.browserAiFailed',
            'The browser AI preference could not be changed.'
          )}
        </p>
      ) : null}
    </section>
  )
}

function availabilityLabel(
  availability: 'available' | 'downloadable' | 'downloading' | 'unavailable'
): string {
  switch (availability) {
    case 'available':
      return translate('extension.browserSettings.browserAiAvailable', 'Available on this device')
    case 'downloadable':
      return translate(
        'extension.browserSettings.browserAiDownloadable',
        'Chrome can download the local model'
      )
    case 'downloading':
      return translate(
        'extension.browserSettings.browserAiDownloading',
        'Chrome is downloading the model'
      )
    case 'unavailable':
      return translate(
        'extension.browserSettings.browserAiUnavailable',
        'Unavailable on this device'
      )
  }
}
