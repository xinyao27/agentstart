import type { WorkspaceEventRecord } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

export type AwayReplayMarker = Record<string, number>

export type AwayReplayScope = {
  events: WorkspaceEventRecord[]
  latestId: number
  scope: string
}

export function readAwayReplayMarker(serialized: string | null): AwayReplayMarker {
  if (!serialized) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([scope, value]) =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
          ? [[scope, value]]
          : []
      )
    )
  } catch {
    return {}
  }
}

export function latestAwayReplayMarker(scopes: AwayReplayScope[]): AwayReplayMarker {
  return Object.fromEntries(scopes.map((scope) => [scope.scope, scope.latestId]))
}

export function buildAwayReplayFacts(
  scopes: AwayReplayScope[],
  projectNames: ReadonlyMap<string, string>
): string {
  return scopes
    .flatMap((scope) => projectFacts(scope, projectNames.get(scope.scope) ?? scope.scope))
    .join(' ')
}

function projectFacts(scope: AwayReplayScope, projectName: string): string[] {
  const events = scope.events.filter(isReplayEvent)
  if (events.length === 0) {
    return []
  }
  const waiting = countKind(events, 'agent.phase.waiting-decision')
  const completed = countKind(events, 'agent.phase.complete')
  const created = countKind(events, 'worktree.create.starting-workspace')
  const browserIssues = events.filter((event) =>
    ['browser.console.error', 'browser.console.claim-failed'].includes(event.kind)
  ).length
  const browserActivity = events.filter((event) =>
    [
      'browser.performance-audit.saved',
      'browser.replay.completed',
      'browser.visual-capture.saved',
      'browser.writeback.verified'
    ].includes(event.kind)
  ).length
  const archived = countKind(events, 'worktree.archive.complete')
  const rituals = events.filter((event) => event.kind.startsWith('ritual.')).length
  const changedFileCount = latestChangedFileCount(events)
  return [
    waiting > 0
      ? translate(
          'extension.awayReplay.waiting',
          '{{project}}: {{count}} agent(s) are waiting for your decision.',
          { count: waiting, project: projectName }
        )
      : null,
    completed > 0
      ? translate('extension.awayReplay.completed', '{{project}}: {{count}} agent(s) completed.', {
          count: completed,
          project: projectName
        })
      : null,
    changedFileCount > 0
      ? translate(
          'extension.awayReplay.changedFiles',
          '{{project}} now has {{count}} changed file(s).',
          { count: changedFileCount, project: projectName }
        )
      : null,
    created > 0
      ? translate(
          'extension.awayReplay.createdWorktrees',
          '{{project}}: {{count}} workspace(s) became ready.',
          { count: created, project: projectName }
        )
      : null,
    browserIssues > 0
      ? translate(
          'extension.awayReplay.browserIssues',
          '{{project}}: {{count}} browser issue(s) were captured.',
          { count: browserIssues, project: projectName }
        )
      : null,
    browserActivity > 0
      ? translate(
          'extension.awayReplay.browserActivity',
          '{{project}}: {{count}} browser task(s) completed.',
          { count: browserActivity, project: projectName }
        )
      : null,
    archived > 0
      ? translate(
          'extension.awayReplay.archivedWorktrees',
          '{{project}}: {{count}} workspace(s) were archived.',
          { count: archived, project: projectName }
        )
      : null,
    rituals > 0
      ? translate(
          'extension.awayReplay.rituals',
          '{{project}}: {{count}} work ritual(s) completed.',
          { count: rituals, project: projectName }
        )
      : null
  ].filter((fact): fact is string => fact !== null)
}

function latestChangedFileCount(events: WorkspaceEventRecord[]): number {
  return events.reduce(
    (latest, event) =>
      event.kind === 'agent.workspace-changes' && typeof event.payload.changedFileCount === 'number'
        ? event.payload.changedFileCount
        : latest,
    0
  )
}

function countKind(events: WorkspaceEventRecord[], kind: string): number {
  return events.filter((event) => event.kind === kind).length
}

function isReplayEvent(event: WorkspaceEventRecord): boolean {
  return (
    event.kind.startsWith('agent.') ||
    event.kind === 'worktree.create.starting-workspace' ||
    event.kind === 'worktree.archive.complete' ||
    event.kind.startsWith('browser.') ||
    event.kind.startsWith('ritual.')
  )
}
