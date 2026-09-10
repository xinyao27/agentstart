import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'

import { SettingsSwitchRow } from '../../settings/form-controls'
import { getExtensionBrowserCapabilities } from '../browser-capabilities'

const CONTEXT_AWARENESS_QUERY_KEY = ['extension-host', 'context-awareness'] as const

export function BrowserContextPrivacySetting(): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const awareness = useQuery({
    queryKey: CONTEXT_AWARENESS_QUERY_KEY,
    queryFn: capabilities.isContextAwarenessEnabled
  })
  const trustedSites = useQuery({
    queryKey: ['extension-host', 'trusted-sites'],
    queryFn: capabilities.readTrustedSites
  })
  const revokeSite = useMutation({
    mutationFn: capabilities.revokeTrustedSite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['extension-host', 'trusted-sites'] })
    }
  })
  const updateAwareness = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!enabled) {
        await capabilities.disableContextAwareness()
        return false
      }
      const granted = await capabilities.enableContextAwareness()
      if (!granted) {
        throw new Error('context_awareness_permission_denied')
      }
      return true
    },
    onSuccess: (enabled) => queryClient.setQueryData(CONTEXT_AWARENESS_QUERY_KEY, enabled)
  })

  return (
    <section className="border-border space-y-2 border-b pb-2">
      <SettingsSwitchRow
        label={translate('extension.context.settingsTitle', 'Browser project context')}
        description={translate(
          'extension.context.settingsDescription',
          'Show project actions only when the current URL or local development port matches daemon facts exactly. AgentStart never guesses.'
        )}
        checked={awareness.data === true}
        disabled={awareness.isPending || updateAwareness.isPending}
        onChange={() => updateAwareness.mutate(awareness.data !== true)}
        ariaLabel={translate('extension.context.settingsTitle', 'Browser project context')}
      />
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-muted-foreground text-xs">
          {updateAwareness.isError
            ? translate(
                'extension.context.settingsDenied',
                'Chrome did not grant the requested tab access.'
              )
            : translate(
                'extension.context.settingsSiteAccess',
                'Sites with persistent browser access are listed here.'
              )}
        </p>
      </div>
      {(trustedSites.data ?? []).map((origin) => (
        <div key={origin} className="border-border flex items-center gap-3 border p-2">
          <span className="min-w-0 flex-1 truncate text-xs">{origin}</span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={revokeSite.isPending}
            onClick={() => revokeSite.mutate(origin)}
          >
            {translate('extension.settings.revokeSite', 'Remove')}
          </Button>
        </div>
      ))}
    </section>
  )
}
