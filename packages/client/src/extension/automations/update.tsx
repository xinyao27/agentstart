import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'

import { openLocalUpdaterTarget } from '../../runtime/updater-target'

const UPDATE_QUERY_KEY = ['extension-host', 'daemon-update'] as const

async function checkDaemonUpdate() {
  const client = await openLocalUpdaterTarget()
  return client.check()
}

export function DaemonUpdateCard(): React.JSX.Element {
  const queryClient = useQueryClient()
  const statusQuery = useQuery({
    queryKey: UPDATE_QUERY_KEY,
    queryFn: checkDaemonUpdate,
    staleTime: 6 * 60 * 60_000
  })
  const check = useMutation({
    mutationFn: checkDaemonUpdate,
    onSuccess: (result) => queryClient.setQueryData(UPDATE_QUERY_KEY, result)
  })
  const snapshot = check.data ?? statusQuery.data
  const available = snapshot?.status.state === 'available' ? snapshot.status : null
  return (
    <section className="border-border mt-5 border p-4">
      <h2 className="font-medium">
        {translate('extension.automations.daemonUpdate', 'Daemon update')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {snapshot
          ? available
            ? translate(
                'extension.automations.updateAvailableVersion',
                'Update {{version}} is available.',
                {
                  version: available.version
                }
              )
            : translate(
                'extension.automations.daemonVersion',
                'Installed {{current}} · latest {{latest}}',
                {
                  current: snapshot.appVersion,
                  latest: 'unknown'
                }
              )
          : translate('extension.automations.updateNotChecked', 'Update status has not loaded.')}
      </p>
      {available?.releaseUrl ? (
        <pre className="bg-muted mt-2 overflow-x-auto p-2 text-xs">{available.releaseUrl}</pre>
      ) : null}
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="mt-3"
        disabled={check.isPending}
        onClick={() => check.mutate()}
      >
        {translate('extension.automations.checkUpdate', 'Check now')}
      </Button>
      {check.isError || statusQuery.isError ? (
        <p className="text-destructive mt-2 text-sm">
          {translate(
            'extension.automations.updateCheckFailed',
            'The release service could not be reached. Your daemon keeps running unchanged.'
          )}
        </p>
      ) : null}
    </section>
  )
}
