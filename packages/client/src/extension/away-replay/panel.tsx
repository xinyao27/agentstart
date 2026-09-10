import type { WorkspaceEventRecord } from '@agentstart/protocol'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ClockCounterClockwise } from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { requireWorkspaceEventsClient } from '~renderer/runtime/workspace-events-target'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { getExtensionHostNavigation } from '../navigation'
import { projectsQuery, WORKSPACE_EVENTS_QUERY_ROOT } from '../runtime/queries'
import {
  buildAwayReplayFacts,
  latestAwayReplayMarker,
  readAwayReplayMarker,
  type AwayReplayMarker,
  type AwayReplayScope
} from './model'

const MARKER_KEY = 'agentstart.away-replay.v1'
const EVENT_PAGE_SIZE = 500

type ReplayCycle = {
  marker: AwayReplayMarker
  returnedAt: number
}

export function AwayReplay(): React.JSX.Element | null {
  const [cycle, setCycle] = useState<ReplayCycle>(() => ({
    marker: readMarker(),
    returnedAt: Date.now()
  }))
  const projects = useQuery(projectsQuery)
  const projectIds = (projects.data?.repos ?? []).map((project) => project.id).sort()
  const projectKey = projectIds.join('\0')
  const markerKey = JSON.stringify(cycle.marker)
  const replay = useQuery({
    enabled: projectIds.length > 0,
    queryKey: [
      ...WORKSPACE_EVENTS_QUERY_ROOT,
      'away-replay',
      projectKey,
      markerKey,
      cycle.returnedAt
    ],
    queryFn: async () => loadAwayReplay(projectIds, cycle)
  })
  const scopes = replay.data ?? []
  const latestMarker = latestAwayReplayMarker(scopes)
  useAwayReplayVisibility(setCycle, latestMarker)
  const projectNames = new Map(
    (projects.data?.repos ?? []).map((project) => [project.id, project.displayName])
  )
  const facts = buildAwayReplayFacts(scopes, projectNames)
  const summary = useQuery({
    enabled: facts.length > 0,
    queryKey: ['extension-host', 'away-replay-summary', facts],
    queryFn: async () => getExtensionBrowserCapabilities().summarizeText(facts),
    staleTime: Infinity
  })
  if (!facts) {
    return null
  }
  const dismiss = (): void => {
    writeMarker(latestMarker)
    setCycle({ marker: latestMarker, returnedAt: Date.now() })
  }
  const viewActivity = (): void => {
    dismiss()
    getExtensionHostNavigation().openPage('activity')
  }
  return (
    <section className="border-sidebar-border border-b p-2">
      <div className="border-sidebar-border bg-sidebar-accent/45 border p-2">
        <div className="flex items-start gap-2">
          <ClockCounterClockwise className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">
              {translate('extension.awayReplay.title', 'While you were away')}
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {summary.data?.text ?? facts}
            </p>
            <div className="mt-2 flex gap-1">
              <Button type="button" size="xs" onClick={viewActivity}>
                {translate('extension.awayReplay.viewActivity', 'View activity')}
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={dismiss}>
                {translate('extension.awayReplay.dismiss', 'Dismiss')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function useAwayReplayVisibility(
  setCycle: React.Dispatch<React.SetStateAction<ReplayCycle>>,
  latestMarker: AwayReplayMarker
): void {
  const markSeen = useEventCallback((): void => writeMarker(latestMarker))
  useEffect(() => {
    const handleVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        markSeen()
        return
      }
      setCycle({ marker: readMarker(), returnedAt: Date.now() })
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', markSeen)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', markSeen)
    }
  }, [markSeen, setCycle])
}

async function loadAwayReplay(
  projectIds: string[],
  cycle: ReplayCycle
): Promise<AwayReplayScope[]> {
  const client = await requireWorkspaceEventsClient({ kind: 'local' })
  return Promise.all(
    projectIds.map(async (scope) => {
      const afterId = cycle.marker[scope]
      if (afterId === undefined) {
        const current = await client.list({
          afterId: Number.MAX_SAFE_INTEGER,
          limit: 1,
          scope
        })
        return { events: [], latestId: current.latestId, scope }
      }
      const events: WorkspaceEventRecord[] = []
      let cursor = afterId
      let latestId = afterId
      do {
        const page = await client.list({
          afterId: cursor,
          limit: EVENT_PAGE_SIZE,
          scope
        })
        latestId = page.latestId
        for (const event of page.events) {
          cursor = Math.max(cursor, event.id)
          if (event.occurredAt <= cycle.returnedAt) {
            events.push(event)
          }
        }
        if (page.events.length < EVENT_PAGE_SIZE) {
          break
        }
      } while (cursor < latestId)
      return { events, latestId, scope }
    })
  )
}

function readMarker(): AwayReplayMarker {
  return readAwayReplayMarker(window.localStorage.getItem(MARKER_KEY))
}

function writeMarker(marker: AwayReplayMarker): void {
  window.localStorage.setItem(MARKER_KEY, JSON.stringify(marker))
}
