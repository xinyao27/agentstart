import type { WorkspaceEventRecord } from '@yiru/protocol'
import { useEffect } from 'react'
import { listRuntimeRepos } from '~renderer/runtime/repo-catalog-target'
import { watchWorkspaceEvents } from '~renderer/runtime/workspace-events-target'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'

export function DaemonCommandBridge(): null {
  useEffect(() => {
    const controller = new AbortController()
    void consumeCommands(controller.signal)
    return () => {
      controller.abort()
    }
  }, [])
  return null
}

async function consumeCommands(signal: AbortSignal): Promise<void> {
  let afterId = 0
  while (!signal.aborted) {
    try {
      // Why: the daemon resumes the journal at this cursor, so a reopened watch
      // never re-runs a command this bridge already applied.
      await watchWorkspaceEvents({ kind: 'local' }, { afterId, scope: 'daemon' }, signal, (event) =>
        applyCommand(event).then(() => {
          afterId = event.id
        })
      )
    } catch {
      if (!signal.aborted) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1_500))
      }
    }
  }
}

async function applyCommand(event: WorkspaceEventRecord): Promise<void> {
  if (event.kind !== 'browser.open-tab.requested') {
    if (event.kind === 'ritual.start-day.complete' || event.kind === 'ritual.end-day.complete') {
      const projects = await listRuntimeRepos({ kind: 'local' })
      await getExtensionBrowserCapabilities().applyScheduledRitual({
        eventId: event.id,
        kind: event.kind === 'ritual.start-day.complete' ? 'start-day' : 'end-day',
        projectIds: projects.repos.map((project) => project.id)
      })
    }
    return
  }
  const url = event.payload.url
  const projectId = event.payload.projectId
  if (typeof url !== 'string') {
    return
  }
  await getExtensionBrowserCapabilities().openDaemonTabCommand({
    eventId: event.id,
    ...(typeof projectId === 'string' ? { projectId } : {}),
    url
  })
}
