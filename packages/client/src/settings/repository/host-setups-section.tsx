import { getRepoExecutionHostId, type ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import { useState } from 'react'
import { buildExecutionHostRegistry } from '~renderer/execution-host-registry'
import { getExecutionHostLabel } from '~renderer/execution-host/labels'
import { getHostDisplayLabelOverrides } from '~renderer/host-setting-overrides'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Label } from '~renderer/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import { SettingsBadge } from '../form-controls'
import { matchesSettingsSearch } from '../search'
import type { SettingsSearchEntry } from '../search'
import { SearchableSetting } from '../searchable-setting'
import { RepositoryHostSetupActions } from './host-setup-actions'
import { buildSetupHostOptions, getSetupStateLabel } from './host-setup-options'

type RepositoryHostSetupsSectionProps = {
  repo: Repo
  forceVisible: boolean
  searchQuery: string
  searchEntries: SettingsSearchEntry[]
}

export function RepositoryHostSetupsSection({
  repo,
  forceVisible,
  searchQuery,
  searchEntries
}: RepositoryHostSetupsSectionProps): React.JSX.Element | null {
  const setSettingsProjectHostSelection = useAppStore(
    (state) => state.setSettingsProjectHostSelection
  )
  const setupProjectExistingFolder = useAppStore((state) => state.setupProjectExistingFolder)
  const setupProjectClone = useAppStore((state) => state.setupProjectClone)
  const createProjectHostSetup = useAppStore((state) => state.createProjectHostSetup)
  const deleteProjectHostSetup = useAppStore((state) => state.deleteProjectHostSetup)
  const {
    projectHostSetups: allProjectHostSetups,
    repos,
    runtimeEnvironments
  } = useProjectCatalog()
  const settings = useAppStore((state) => state.settings)
  const runtimeStatusByEnvironmentId = useAppStore((state) => state.runtimeStatusByEnvironmentId)
  const hostLabelOverrides = (() => getHostDisplayLabelOverrides(settings))()
  const hostOptions = (() =>
    buildExecutionHostRegistry({
      repos,
      settings,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides
    }))()
  const selectedHostId = getRepoExecutionHostId(repo)
  const selectedProjectHostSetup = allProjectHostSetups.find(
    (setup) => setup.repoId === repo.id && setup.hostId === selectedHostId
  )
  const projectHostSetups = selectedProjectHostSetup
    ? allProjectHostSetups.filter((setup) => setup.projectId === selectedProjectHostSetup.projectId)
    : []
  const openableProjectHostSetups = projectHostSetups.filter((setup) => setup.repoId.trim())
  const setupHostOptions = buildSetupHostOptions({
    projectHostSetups,
    hostOptions
  })
  const hostOptionById = new Map(hostOptions.map((option) => [option.id, option]))
  const [deletingSetupId, setDeletingSetupId] = useState<string | null>(null)
  const projectId = selectedProjectHostSetup?.projectId
  // Why: the single project pane switches host in place — set the ephemeral
  // per-project selection instead of navigating to a separate repo section.
  const selectHost = (hostId: ExecutionHostId) => {
    if (projectId) {
      setSettingsProjectHostSelection(projectId, hostId)
    }
  }
  if (
    (projectHostSetups.length <= 1 && setupHostOptions.length === 0) ||
    (!forceVisible && !matchesSettingsSearch(searchQuery, searchEntries))
  ) {
    return null
  }

  return (
    <SearchableSetting
      title={translate('auto.components.settings.RepositoryPane.availableHosts', 'Available Hosts')}
      description={translate(
        'auto.components.settings.RepositoryPane.availableHostsDescription',
        'Hosts where this project is set up.'
      )}
      keywords={[repo.displayName, 'host', 'ssh', 'remote', 'vm', 'path']}
      className="space-y-3"
      forceVisible={forceVisible}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Label className="text-sm font-semibold">
            {translate('auto.components.settings.RepositoryPane.availableHosts', 'Available Hosts')}
          </Label>
          {openableProjectHostSetups.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {translate('auto.components.settings.RepositoryPane.viewingHost', 'Viewing host')}
              </span>
              <Select
                value={selectedHostId}
                onValueChange={(hostId) => {
                  if (hostId === null || hostId === selectedHostId) {
                    return
                  }
                  selectHost(hostId as ExecutionHostId)
                }}
              >
                <SelectTrigger className="h-8 w-44 min-w-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {openableProjectHostSetups.map((setup) => (
                    <SelectItem key={setup.hostId} value={setup.hostId}>
                      <span className="block min-w-0 truncate">
                        {hostOptionById.get(setup.hostId)?.label ??
                          getExecutionHostLabel(setup.hostId)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.RepositoryPane.availableHostsHelp',
            'Project paths and worktree settings are host-specific; creating a workspace can target any ready setup.'
          )}
        </p>
      </div>
      <div className="divide-border border-border divide-y rounded-md border">
        {projectHostSetups.map((setup) => {
          const isCurrentSetup = setup.hostId === selectedHostId
          const canOpenSetup = setup.repoId.trim().length > 0
          const canRemoveSetup = !canOpenSetup && deletingSetupId !== setup.id
          return (
            <div
              key={setup.hostId}
              className={cn(
                'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                isCurrentSetup ? 'bg-muted/30' : ''
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {hostOptionById.get(setup.hostId)?.label ?? getExecutionHostLabel(setup.hostId)}
                  </span>
                  <SettingsBadge tone={setup.setupState === 'ready' ? 'accent' : 'muted'}>
                    {getSetupStateLabel(setup.setupState)}
                  </SettingsBadge>
                </div>
                <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                  {setup.path ||
                    translate(
                      'auto.components.settings.RepositoryPane.setupPathPending',
                      'Path pending'
                    )}
                </p>
              </div>
              {isCurrentSetup ? (
                <SettingsBadge>
                  {translate('auto.components.settings.RepositoryPane.currentSetup', 'Current')}
                </SettingsBadge>
              ) : null}
              {!isCurrentSetup && canOpenSetup ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    selectHost(setup.hostId)
                  }}
                >
                  {translate('auto.components.settings.RepositoryPane.openSetup', 'Open')}
                </Button>
              ) : null}
              {canRemoveSetup ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setDeletingSetupId(setup.id)
                    await deleteProjectHostSetup({ setupId: setup.id })
                    setDeletingSetupId(null)
                  }}
                >
                  {translate('auto.components.settings.RepositoryPane.removeSetup', 'Remove')}
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
      {selectedProjectHostSetup ? (
        <RepositoryHostSetupActions
          repoDisplayName={repo.displayName}
          selectedProjectHostSetup={selectedProjectHostSetup}
          setupHostOptions={setupHostOptions}
          setupProjectExistingFolder={setupProjectExistingFolder}
          setupProjectClone={setupProjectClone}
          createProjectHostSetup={createProjectHostSetup}
          onSetupReady={selectHost}
        />
      ) : null}
    </SearchableSetting>
  )
}
