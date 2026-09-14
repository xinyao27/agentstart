import type { RepoHookSettingsValue as RepoHookSettings } from '@agentstart/protocol'
import { getRepoExecutionHostId, type ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { Project, ProjectUpdateArgs } from '@agentstart/protocol/project/model'
import type { Repo } from '@agentstart/protocol/project/repository'
import { isFolderRepo } from '@agentstart/protocol/project/repository'
import type { AgentStartHooks } from '@agentstart/protocol/worktree/hooks'
import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '~renderer/i18n/i18n'
import {
  FolderSimple,
  Gear,
  ListDashes,
  Play,
  Robot,
  Trash as Trash2,
  Link
} from '~renderer/icons/hugeicons'
import { getRepoKindLabel } from '~renderer/project-catalog/kind-label'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Label } from '~renderer/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { SettingsGroupCards, type SettingsGroup } from '../group-card'
import { McpConfigSection } from '../mcp-config-section'
import { SearchableSetting } from '../searchable-setting'
import { getSettingOwnershipSummary } from '../setting-ownership'
import { SparsePresetSettingsSection } from '../sparse-preset-settings-section'
import { WorktreeSymlinksSection } from '../worktree-symlinks-section'
import { RepositoryForkSyncSection } from './fork-sync-section'
import { RepositoryHooksSection } from './hooks-section'
import { RepositoryHostSetupsSection } from './host-setups-section'
import { RepositoryIconPicker } from './icon-picker'
import { matchesRepositoryIdentitySearch } from './identity-search'
import { getProjectRuntimeSessionSummary } from './runtime-session-summary'
import { getRepositoryPaneSearchEntries, sliceRepositoryPaneSearchEntries } from './search'
import { RepoSettingsDraftInput } from './settings-draft-input'
import { getRepositoryIconSectionId } from './settings-targets'
import { RepositorySourceControlAiSection } from './source-control-ai-section'
import { RepositoryWindowsRuntimeSection } from './windows-runtime-section'
import { RepositoryWorktreeDefaultsSection } from './worktree-defaults-section'
type RepositoryPaneRepoUpdate = Omit<Partial<Repo>, 'sourceControlAi'> & {
  sourceControlAi?: Repo['sourceControlAi'] | null
}

const EMPTY_WSL_DISTROS: string[] = []

type RepositoryPaneProps = {
  repo: Repo
  yamlHooks: AgentStartHooks | null
  hasHooksFile: boolean
  hooksInspectionReady: boolean
  mayNeedUpdate: boolean
  updateRepo: (
    repoId: string,
    updates: RepositoryPaneRepoUpdate,
    options?: { hostId?: ExecutionHostId }
  ) => void
  removeProject: (repoId: string) => void
  project?: Project | null
  isLocalWindowsProject?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
  updateProject?: (
    projectId: string,
    updates: ProjectUpdateArgs['updates']
  ) => void | Promise<unknown>
}

export function RepositoryPane({
  repo,
  yamlHooks,
  hasHooksFile,
  hooksInspectionReady,
  mayNeedUpdate,
  updateRepo,
  removeProject,
  project = null,
  isLocalWindowsProject = false,
  wslAvailable = false,
  wslDistros = EMPTY_WSL_DISTROS,
  wslCapabilitiesLoading = false,
  updateProject
}: RepositoryPaneProps): React.JSX.Element {
  const isFolder = isFolderRepo(repo)
  // Why: this pane renders the switcher-selected host's repo row. Bind every
  // edit to that host so identity/host-specific writes land on the selected
  // host, not findRepoForHost's focused-host fallback (the same-id/self-pair
  // case where local and a runtime share one repo id).
  const selectedHostId = getRepoExecutionHostId(repo)
  const updateSelectedRepo = (repoId: string, updates: RepositoryPaneRepoUpdate) =>
    updateRepo(repoId, updates, { hostId: selectedHostId })
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const settings = useAppStore((state) => state.settings)
  const runtimeSessionSummary = useAppStore(
    useShallow((state) => getProjectRuntimeSessionSummary(state, repo.id))
  )
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [copiedTemplate, setCopiedTemplate] = useState(false)
  const copiedTemplateResetTimerRef = useRef<number | null>(null)
  // Why: clipboard IPC can resolve after settings navigation; avoid starting
  // a reset timer that will outlive this pane.
  const isMountedRef = useRef(false)
  // Why: searching a project name is navigation to that project, not a
  // request to hide every child row that does not repeat the project name.
  const forceFullPaneForRepoMatch = matchesRepositoryIdentitySearch(searchQuery, repo)

  const clearCopiedTemplateResetTimer = (): void => {
    if (copiedTemplateResetTimerRef.current !== null) {
      window.clearTimeout(copiedTemplateResetTimerRef.current)
      copiedTemplateResetTimerRef.current = null
    }
  }

  const setRepositoryPaneRootRef = (node: HTMLDivElement | null) => {
    isMountedRef.current = node !== null
    if (node === null) {
      clearCopiedTemplateResetTimer()
    }
  }

  const handleRemoveProject = (repoId: string) => {
    if (confirmingRemove === repoId) {
      removeProject(repoId)
      setConfirmingRemove(null)
      return
    }

    setConfirmingRemove(repoId)
  }

  const updateSelectedRepoHookSettings = (nextSettings: RepoHookSettings) => {
    updateSelectedRepo(repo.id, {
      hookSettings: nextSettings
    })
  }

  const handleCopyTemplate = async () => {
    // Why: the missing-`agentstart.yaml` state is a migration aid, so copying the shared-template
    // snippet should be one click rather than forcing users to reconstruct the expected shape.
    await shellClient.ui.writeClipboardText(`scripts:
  setup: |
    pnpm worktree:setup
  archive: |
    echo "Cleaning up before archive"`)
    if (!isMountedRef.current) {
      return
    }
    clearCopiedTemplateResetTimer()
    setCopiedTemplate(true)
    copiedTemplateResetTimerRef.current = window.setTimeout(() => {
      copiedTemplateResetTimerRef.current = null
      setCopiedTemplate(false)
    }, 1500)
  }

  const {
    identityEntries,
    sparsePresetEntries,
    hooksEntries,
    mcpEntries,
    symlinkEntries,
    sourceControlAiEntries,
    hostSetupEntries,
    projectRuntimeEntries
  } = sliceRepositoryPaneSearchEntries(
    getRepositoryPaneSearchEntries(repo, { isLocalWindowsProject })
  )
  const removeProjectLabel =
    confirmingRemove === repo.id ? 'Confirm Remove Project' : 'Remove Project'

  // Why: Identity (name, icon, base ref) stays at the top so it's the first
  // thing a user sees. Setup commands follow immediately because they're the
  // most-edited surface and should beat MCP/symlinks/sparse-presets.
  const groups: SettingsGroup[] = [
    {
      id: 'repo-identity',
      icon: <FolderSimple aria-hidden="true" />,
      title: translate('auto.components.settings.RepositoryPane.499a437335', 'Identity'),
      summary: translate(
        'auto.components.settings.RepositoryPane.b0a0c14a1c',
        'Project-specific display details for the sidebar and tabs.'
      ),
      searchEntries: identityEntries,
      content: (
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 pr-12">
              <p className="text-muted-foreground text-xs">
                {translate('auto.components.settings.RepositoryPane.323debba71', 'Type:')}
                <span className="text-foreground">{getRepoKindLabel(repo)}</span>
              </p>
              {isFolder ? (
                <p className="text-muted-foreground text-xs">
                  {translate(
                    'auto.components.settings.RepositoryPane.ee5a290616',
                    'Opened as folder. Git features are unavailable for this workspace.'
                  )}
                </p>
              ) : null}
            </div>
            <SearchableSetting
              title={translate(
                'auto.components.settings.RepositoryPane.0909e5d650',
                'Remove Project'
              )}
              description={translate(
                'auto.components.settings.RepositoryPane.removeProjectAllHosts',
                'Remove this project from AgentStart on all configured hosts.'
              )}
              keywords={[repo.displayName, 'delete', 'project', 'repository']}
              className="absolute top-0 right-0 z-10 w-auto max-w-none"
              forceVisible={forceFullPaneForRepoMatch}
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant={confirmingRemove === repo.id ? 'destructive' : 'outline'}
                      size="icon-sm"
                      onClick={() => handleRemoveProject(repo.id)}
                      onBlur={() => setConfirmingRemove(null)}
                      aria-label={removeProjectLabel}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent side="top" sideOffset={4}>
                  {removeProjectLabel}
                </TooltipContent>
              </Tooltip>
            </SearchableSetting>
          </div>

          <div className="mt-6 space-y-8">
            <SearchableSetting
              title={translate(
                'auto.components.settings.RepositoryPane.c7ef4415de',
                'Display Name'
              )}
              description={translate(
                'auto.components.settings.RepositoryPane.b0a0c14a1c',
                'Project-specific display details for the sidebar and tabs.'
              )}
              keywords={[repo.displayName, repo.path, 'project name', 'repository name']}
              className="space-y-2"
              forceVisible={forceFullPaneForRepoMatch}
            >
              <Label htmlFor={`repo-display-name-${repo.id}`} className="text-sm font-semibold">
                {translate('auto.components.settings.RepositoryPane.c7ef4415de', 'Display Name')}
              </Label>
              <RepoSettingsDraftInput
                id={`repo-display-name-${repo.id}`}
                repoId={repo.id}
                storeValue={repo.displayName}
                onTextChange={(text) => updateSelectedRepo(repo.id, { displayName: text })}
                className="h-9 text-sm"
              />
            </SearchableSetting>

            <SearchableSetting
              title={translate(
                'auto.components.settings.RepositoryPane.26fef02bf3',
                'Project Icon'
              )}
              description={translate(
                'auto.components.settings.RepositoryPane.e641c359de',
                'Project icon and color used in the sidebar and tabs.'
              )}
              keywords={[
                repo.displayName,
                repo.path,
                'project icon',
                'repository icon',
                'color',
                'badge',
                'emoji',
                'favicon'
              ]}
              className="space-y-2"
              id={getRepositoryIconSectionId(repo.id)}
              forceVisible={forceFullPaneForRepoMatch}
            >
              <RepositoryIconPicker repo={repo} updateRepo={updateSelectedRepo} />
            </SearchableSetting>

            {!isFolder ? (
              <>
                <RepositoryHostSetupsSection
                  repo={repo}
                  forceVisible={forceFullPaneForRepoMatch}
                  searchQuery={searchQuery}
                  searchEntries={hostSetupEntries}
                />

                <RepositoryWindowsRuntimeSection
                  repoDisplayName={repo.displayName}
                  project={project}
                  settings={settings}
                  isLocalWindowsProject={isLocalWindowsProject}
                  wslAvailable={wslAvailable}
                  wslDistros={wslDistros}
                  wslCapabilitiesLoading={wslCapabilitiesLoading}
                  runtimeSessionSummary={runtimeSessionSummary}
                  updateProject={updateProject}
                  forceVisible={forceFullPaneForRepoMatch}
                  searchQuery={searchQuery}
                  searchEntries={projectRuntimeEntries}
                />

                <RepositoryForkSyncSection
                  repo={repo}
                  updateRepo={updateSelectedRepo}
                  forceVisible={forceFullPaneForRepoMatch}
                />

                <RepositoryWorktreeDefaultsSection
                  repo={repo}
                  settings={settings}
                  updateRepo={updateSelectedRepo}
                  forceVisible={forceFullPaneForRepoMatch}
                />
              </>
            ) : null}
          </div>
        </div>
      )
    }
  ]

  if (!isFolder) {
    groups.push(
      {
        id: 'repo-hooks',
        icon: <Play aria-hidden="true" />,
        title: translate(
          'auto.components.settings.RepositoryHooksSection.ff082fe7c6',
          'Worktree Hooks'
        ),
        summary: translate(
          'auto.components.settings.RepositoryHooksSection.8567127a40',
          'Scripts that run when worktrees are created or archived. Local scripts are stored on this machine; `agentstart.yaml` scripts are shared with your team.'
        ),
        searchEntries: hooksEntries,
        content: (
          <RepositoryHooksSection
            repo={repo}
            yamlHooks={yamlHooks}
            hasHooksFile={hasHooksFile}
            hooksInspectionReady={hooksInspectionReady}
            mayNeedUpdate={mayNeedUpdate}
            copiedTemplate={copiedTemplate}
            forceVisible={forceFullPaneForRepoMatch}
            onCopyTemplate={() => void handleCopyTemplate()}
            onUpdateHookSettings={updateSelectedRepoHookSettings}
          />
        )
      },
      {
        id: 'repo-source-control-ai',
        icon: <Robot aria-hidden="true" />,
        title: translate(
          'auto.components.settings.RepositorySourceControlAiSection.71b003b62b',
          'Source Control AI'
        ),
        summary: getSettingOwnershipSummary('repositorySourceControlAi').description,
        searchEntries: sourceControlAiEntries,
        content: <RepositorySourceControlAiSection repo={repo} updateRepo={updateSelectedRepo} />
      },
      // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
      // removed (#63) — symlinks are always local now, so the SSH exclusion
      // that used to gate this section never fires.
      {
        id: 'repo-symlinks',
        icon: <Link aria-hidden="true" />,
        title: translate(
          'auto.components.settings.WorktreeSymlinksSection.4755f120b6',
          'Worktree Shared Paths'
        ),
        summary: translate(
          'auto.components.settings.WorktreeSymlinksSection.b07ef5a8b6',
          'Paths to materialize from the primary checkout into newly created worktrees.'
        ),
        searchEntries: symlinkEntries,
        content: <WorktreeSymlinksSection repo={repo} updateRepo={updateSelectedRepo} />
      },
      {
        id: 'repo-sparse-presets',
        icon: <ListDashes aria-hidden="true" />,
        title: translate(
          'auto.components.settings.SparsePresetSettingsSection.388513be2d',
          'Sparse Checkout Presets'
        ),
        summary: translate(
          'auto.components.settings.SparsePresetSettingsSection.17f8c4ce10',
          'Manage saved directory sets for sparse worktree creation.'
        ),
        searchEntries: sparsePresetEntries,
        content: <SparsePresetSettingsSection repoId={repo.id} />
      },
      {
        id: 'repo-mcp-configs',
        icon: <Gear aria-hidden="true" />,
        title: translate('auto.components.settings.McpConfigSection.55eea3ef47', 'MCP Configs'),
        summary: translate(
          'auto.components.settings.McpConfigSection.96f5609b04',
          'Inspect MCP server definitions that agents can use while working in this repo.'
        ),
        searchEntries: mcpEntries,
        content: <McpConfigSection repo={repo} />
      }
    )
  }

  return (
    <div ref={setRepositoryPaneRootRef}>
      <SettingsGroupCards groups={groups} defaultOpenId="repo-identity" />
    </div>
  )
}
