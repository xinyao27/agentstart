import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RitualRunResult } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'
import { Moon, Sun } from '~renderer/icons/hugeicons'
import { runRitual } from '~renderer/runtime/ritual-target'
import { terminalQueryRoot } from '~renderer/runtime/terminal-query'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { projectsQuery, WORKSPACE_EVENTS_QUERY_ROOT } from '../runtime/queries'
import { BrowserAiSettings } from './browser-ai'
import { RitualScheduleSettings } from './schedule'
import { DangerousApprovalSettings } from './security'
import { DaemonUpdateCard } from './update'

const LOCAL_DAEMON_TARGET = { kind: 'local' } as const

export function AutomationsPage(): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const projects = useQuery(projectsQuery)
  const preferencesKey = ['extension-host', 'workspace-preferences'] as const
  const preferences = useQuery({
    queryKey: preferencesKey,
    queryFn: capabilities.readWorkspacePreferences
  })
  const ritual = useMutation({
    mutationFn: async (kind: RitualRunResult['kind']) => {
      const result = await runRitual(LOCAL_DAEMON_TARGET, kind)
      await (kind === 'start-day'
        ? capabilities.arrangeStartDay(
            result.projects
              .filter((project) => project.status === 'ready')
              .map((project) => project.projectId)
          )
        : capabilities.finishDay())
      return result
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: terminalQueryRoot({ kind: 'local' }) }),
        queryClient.invalidateQueries({ queryKey: WORKSPACE_EVENTS_QUERY_ROOT })
      ])
    }
  })
  const focus = useMutation({ mutationFn: capabilities.openFocusWorkspace })
  const arrange = useMutation({
    mutationFn: async () =>
      capabilities.arrangeWorkspaceWindows(
        (projects.data?.repos ?? []).map((project) => project.id),
        preferences.data?.layoutMode ?? 'cascade'
      )
  })
  const setLayout = useMutation({
    mutationFn: async (layoutMode: 'cascade' | 'displays') => {
      const next = {
        favoriteProjectIds: preferences.data?.favoriteProjectIds ?? [],
        layoutMode,
        useNewTabLauncher: preferences.data?.useNewTabLauncher ?? false
      }
      await capabilities.setWorkspacePreferences(next)
      return next
    },
    onSuccess: (next) => queryClient.setQueryData(preferencesKey, next)
  })
  const setNewTabLauncher = useMutation({
    mutationFn: async (useNewTabLauncher: boolean) => {
      const next = {
        favoriteProjectIds: preferences.data?.favoriteProjectIds ?? [],
        layoutMode: preferences.data?.layoutMode ?? ('cascade' as const),
        useNewTabLauncher
      }
      await capabilities.setWorkspacePreferences(next)
      return next
    },
    onSuccess: (next) => queryClient.setQueryData(preferencesKey, next)
  })
  return (
    <main className="bg-background text-foreground h-dvh overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">
          {translate('extension.automations.title', 'Automations')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {translate(
            'extension.automations.description',
            'One explicit gesture coordinates daemon work and browser layout.'
          )}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <RitualCard
            icon={Sun}
            title={translate('extension.automations.startDay', 'Start day')}
            description={translate(
              'extension.automations.startDayDescription',
              'Fast-forward projects, run configured dev servers, and open project groups.'
            )}
            disabled={ritual.isPending}
            onRun={() => ritual.mutate('start-day')}
          />
          <RitualCard
            icon={Moon}
            title={translate('extension.automations.endDay', 'End day')}
            description={translate(
              'extension.automations.endDayDescription',
              'Record changed-path summaries, collapse project groups, and open Activity.'
            )}
            disabled={ritual.isPending}
            onRun={() => ritual.mutate('end-day')}
          />
        </div>
        <section className="border-border mt-5 border p-4">
          <h2 className="font-medium">
            {translate('extension.automations.browserLayout', 'Browser window layouts')}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {translate(
              'extension.automations.browserLayoutDescription',
              'Move an existing project tab into a focus window, or arrange every project without creating duplicates.'
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            <Button
              type="button"
              size="xs"
              variant={preferences.data?.layoutMode === 'displays' ? 'outline' : 'default'}
              onClick={() => setLayout.mutate('cascade')}
            >
              {translate('extension.automations.layoutCascade', 'Cascade')}
            </Button>
            <Button
              type="button"
              size="xs"
              variant={preferences.data?.layoutMode === 'displays' ? 'default' : 'outline'}
              onClick={() => setLayout.mutate('displays')}
            >
              {translate('extension.automations.layoutDisplays', 'Across displays')}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={(projects.data?.repos.length ?? 0) === 0 || arrange.isPending}
              onClick={() => arrange.mutate()}
            >
              {translate('extension.automations.arrange', 'Arrange projects')}
            </Button>
          </div>
          <div className="border-border mt-3 border-t pt-3">
            <p className="text-muted-foreground text-sm">
              {translate(
                'extension.automations.newTabDescription',
                'Optionally open Yiru Activity for new tabs. This is off by default and requests tab access only when enabled.'
              )}
            </p>
            <Button
              type="button"
              size="xs"
              className="mt-2"
              variant={preferences.data?.useNewTabLauncher ? 'default' : 'outline'}
              disabled={setNewTabLauncher.isPending}
              onClick={() =>
                setNewTabLauncher.mutate(!(preferences.data?.useNewTabLauncher ?? false))
              }
            >
              {preferences.data?.useNewTabLauncher
                ? translate('extension.automations.disableNewTab', 'Stop using Yiru for new tabs')
                : translate('extension.automations.enableNewTab', 'Use Yiru for new tabs')}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {(projects.data?.repos ?? []).map((project) => (
              <Button
                key={project.id}
                type="button"
                size="xs"
                variant="ghost"
                disabled={focus.isPending}
                onClick={() => focus.mutate(project.id)}
              >
                {translate('extension.automations.focusProject', 'Focus {{project}}', {
                  project: project.displayName
                })}
              </Button>
            ))}
          </div>
        </section>
        <RitualScheduleSettings />
        <DangerousApprovalSettings />
        <BrowserAiSettings />
        <DaemonUpdateCard />
        {ritual.data ? (
          <section className="border-border mt-5 border p-4">
            <p className="text-sm font-medium">{ritual.data.summary}</p>
            <ul className="text-muted-foreground mt-2 grid gap-1 text-sm">
              {ritual.data.projects.map((project) => (
                <li key={project.projectId}>
                  {project.status === 'ready' ? '✓' : '·'}{' '}
                  {translate('extension.automations.projectResult', '{{project}}: {{detail}}', {
                    detail: project.detail,
                    project: project.projectId
                  })}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {ritual.isError ||
        focus.isError ||
        arrange.isError ||
        setLayout.isError ||
        setNewTabLauncher.isError ? (
          <p className="text-destructive mt-4 text-sm">
            {translate('extension.automations.failed', 'The ritual could not complete.')}
          </p>
        ) : null}
      </div>
    </main>
  )
}

function RitualCard({
  description,
  disabled,
  icon: Icon,
  onRun,
  title
}: {
  description: string
  disabled: boolean
  icon: React.ComponentType<{ className?: string }>
  onRun: () => void
  title: string
}): React.JSX.Element {
  return (
    <section className="border-border bg-card border p-4">
      <Icon className="text-primary size-5" />
      <h2 className="mt-3 font-medium">{title}</h2>
      <p className="text-muted-foreground mt-1 min-h-10 text-sm">{description}</p>
      <Button type="button" size="sm" className="mt-4" disabled={disabled} onClick={onRun}>
        {translate('extension.automations.run', 'Run')}
      </Button>
    </section>
  )
}
