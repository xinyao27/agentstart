import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'

const TRUSTED_SITES_QUERY_KEY = ['extension-host', 'trusted-sites'] as const

export function TrustedSitesSettings(): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const sites = useQuery({
    queryFn: capabilities.readTrustedSites,
    queryKey: TRUSTED_SITES_QUERY_KEY
  })
  const revoke = useMutation({
    mutationFn: capabilities.revokeTrustedSite,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: TRUSTED_SITES_QUERY_KEY })
  })

  return (
    <section className="border-border mt-5 rounded-lg border p-4">
      <h2 className="font-medium">
        {translate('extension.settings.siteTrust', 'Trusted browser sites')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {translate(
          'extension.settings.siteTrustDescription',
          'These origins may be read without another prompt. Removing one does not affect one-time tab access.'
        )}
      </p>
      {sites.isPending ? (
        <p className="text-muted-foreground mt-3 text-sm" role="status">
          {translate('extension.browserSettings.loadingTrustedSites', 'Loading trusted sites…')}
        </p>
      ) : sites.data?.length ? (
        <div className="mt-3 grid gap-2">
          {sites.data.map((origin) => (
            <div
              className="border-border flex items-center gap-3 rounded-md border p-2"
              key={origin}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{origin}</span>
              <Button
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(origin)}
                size="xs"
                type="button"
                variant="outline"
              >
                {translate('extension.settings.revokeSite', 'Remove')}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">
          {translate('extension.settings.noTrustedSites', 'No sites are always allowed.')}
        </p>
      )}
      {sites.isError || revoke.isError ? (
        <p className="text-destructive mt-3 text-sm" role="alert">
          {translate(
            'extension.browserSettings.trustedSitesFailed',
            'Trusted site permissions could not be updated.'
          )}
        </p>
      ) : null}
    </section>
  )
}
