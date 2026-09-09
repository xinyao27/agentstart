import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { Bug, StopCircle } from '~renderer/icons/hugeicons'
import { terminalQueryRoot } from '~renderer/runtime/terminal-query'
import { requireWorkspaceEventsAppendClient } from '~renderer/runtime/workspace-events-target'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { WORKSPACE_EVENTS_QUERY_ROOT } from '../runtime/queries'

type ConsoleSensorProps = {
  pageUrl: string
  projectId: string
  worktreeId: string
}

export function ConsoleSensor({
  pageUrl,
  projectId,
  worktreeId
}: ConsoleSensorProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const statusKey = ['extension-host', 'console-sensor-status', pageUrl] as const
  const status = useQuery({
    queryKey: statusKey,
    queryFn: capabilities.isConsoleSensorActive,
    refetchInterval: 1_000
  })
  const toggle = useMutation({
    mutationFn: async () => {
      if (status.data) {
        await capabilities.stopConsoleSensor()
        return
      }
      const granted = await capabilities.hasBrowserControlAccess()
      if (!granted) {
        throw new Error('browser_control_unavailable')
      }
      await capabilities.startConsoleSensor()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: statusKey })
    }
  })
  const drain = useQuery({
    enabled: status.data === true,
    queryKey: ['extension-host', 'console-sensor-drain', pageUrl, projectId, worktreeId],
    queryFn: async () => {
      const entries = await capabilities.drainConsoleSensor()
      if (entries.length === 0) {
        return { claimedTerminalHandle: null, eventsAppended: 0 }
      }
      const result = await (
        await requireWorkspaceEventsAppendClient({ kind: 'local' })
      ).appendConsole({ entries, pageUrl, projectId, worktreeId })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_EVENTS_QUERY_ROOT }),
        queryClient.invalidateQueries({ queryKey: terminalQueryRoot({ kind: 'local' }) })
      ])
      return result
    },
    refetchInterval: 1_000
  })
  const error = toggle.error ?? drain.error

  return (
    <div className="border-sidebar-border ml-6 border-l px-2 py-1.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {status.data ? <StopCircle /> : <Bug />}
        {status.data
          ? translate('extension.consoleSensor.stop', 'Stop Console sensor')
          : translate('extension.consoleSensor.start', 'Watch Console errors')}
      </Button>
      <p className="text-muted-foreground pt-1 text-xs">
        {status.data
          ? translate(
              'extension.consoleSensor.active',
              'Errors stream to Activity and an agent claims them.'
            )
          : translate(
              'extension.consoleSensor.ready',
              'Ready when you turn on Console monitoring.'
            )}
      </p>
      {error ? (
        <p className="text-destructive pt-1 text-xs">
          {translate('extension.consoleSensor.failed', 'The Console sensor stopped unexpectedly.')}
        </p>
      ) : null}
    </div>
  )
}
