import { useQuery, useQueryClient } from '@tanstack/react-query'
import { terminalQueryRoot } from '~renderer/runtime/terminal-query'
import { requireWorkspaceEventsAppendClient } from '~renderer/runtime/workspace-events-target'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { WORKSPACE_EVENTS_QUERY_ROOT } from '../runtime/queries'

export function ConsoleSensorBridge(): null {
  const queryClient = useQueryClient()
  useQuery({
    queryKey: ['extension-host', 'claimed-console-sensors'],
    queryFn: async () => {
      const captures = await getExtensionBrowserCapabilities().drainClaimedConsoleSensors()
      if (captures.length === 0) {
        return 0
      }
      const journal = await requireWorkspaceEventsAppendClient({ kind: 'local' })
      await Promise.all(captures.map((capture) => journal.appendConsole(capture)))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: terminalQueryRoot({ kind: 'local' }) }),
        queryClient.invalidateQueries({ queryKey: WORKSPACE_EVENTS_QUERY_ROOT })
      ])
      return captures.reduce((total, capture) => total + capture.entries.length, 0)
    },
    refetchInterval: 1_000
  })
  return null
}
