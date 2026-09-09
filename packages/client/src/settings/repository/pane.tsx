import type { RepoHookSettingsValue as RepoHookSettings } from '@yiru/protocol'
import { getRepoExecutionHostId, type ExecutionHostId } from '@yiru/protocol/host/identity'
import type { Project, ProjectUpdateArgs } from '@yiru/protocol/project/model'
import type { Repo } from '@yiru/protocol/project/repository'
import { isFolderRepo } from '@yiru/protocol/project/repository'
import type { YiruHooks } from '@yiru/protocol/worktree/hooks'
import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '~renderer/i18n/i18n'
import { Trash as Trash2 } from '~renderer/icons/hugeicons'
import { getRepoKindLabel } from '~renderer/project-catalog/kind-label'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Label } from '~renderer/ui/label'
import { Separator } from '~renderer/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { McpConfigSection } from '../mcp-config-section'
import { matchesSettingsSearch } from '../search'
import { SearchableSetting } from '../searchable-setting'
import { SparsePresetSettingsSection } from '../sparse-preset-settings-section'
import { WorktreeSymlinksSection } from '../worktree-symlinks-section'
import { RepositoryForkSyncSection } from './fork-sync-section'
import { RepositoryHooksSection } from './hooks-section'
import { RepositoryHostSetupsSection } from './host-setups-section'
import { RepositoryIconPicker } from './icon-picker'
import { matchesRepositoryIdentitySearch } from './identity-search'
import { getProjectRuntimeSessionSummary } from './runtime-session-summary'
import { getRepositoryPaneSearchEntries } from './search'
import { RepoSettingsDraftInput } from './settings-draft-input'
import { getRepositoryIconSectionId } from './settings-targets'
import { RepositorySourceControlAiSection } from './source-control-ai-section'
import { RepositoryWindowsRuntimeSection } from './windows-runtime-section'
import { RepositoryWorktreeDefaultsSection } from './worktree-defaults-section'
export { getRepositoryPaneSearchEntries }
export { matchesRepositoryIdentitySearch } from './identity-search'

type RepositoryPaneRepoUpdate = Omit<Partial<Repo>, 'sourceControlAi'> & {
  sourceControlAi?: Repo['sourceControlAi'] | null
}

const EMPTY_WSL_DISTROS: string[] = []

type RepositoryPaneProps = {
  repo: Repo
  yamlHooks: YiruHooks | null
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
    // Why: the missing-`yiru.yaml` state is a migration aid, so copying the shared-template
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

  const allEntries = getRepositoryPaneSearchEntries(repo, { isLocalWindowsProject })
  const identityEntryTitles = new Set([
    translate('auto.components.settings.repository.search.7e1e456a95', 'Display Name'),
    translate('auto.components.settings.repository.search.b24f00294a', 'Project Icon'),
    translate(
      'auto.components.settings.repository.search.keepForkUpToDate',
      'Keep Fork Up to Date'
    ),
    translate('auto.components.settings.repository.search.094adbe930', 'Default Worktree Base'),
    translate('auto.components.settings.repository.search.443d127b5a', 'Worktree Location'),
    translate('auto.components.settings.repository.search.projectRuntime', 'Project Runtime'),
    translate('auto.components.settings.repository.search.c5266c2c9d', 'Remove Project')
  ])
  const identityEntries = allEntries.filter((entry) => identityEntryTitles.has(entry.title))
  const sparsePresetEntries = allEntries.filter((entry) =>
    ['Sparse Checkout Presets'].includes(entry.title)
  )
  const hooksEntries = allEntries.filter((entry) =>
    ['Setup Script', 'Archive Script', 'Advanced', 'When to Run Setup'].includes(entry.title)
  )
  const mcpEntries = allEntries.filter((entry) => entry.title === 'MCP Configs')
  const symlinkEntries = allEntries.filter((entry) => entry.title === 'Worktree Shared Paths')
  const sourceControlAiEntries = allEntries.filter((entry) => entry.title === 'Git AI Author')
  const hostSetupEntries = allEntries.filter((entry) => entry.title === 'Available Hosts')
  const projectRuntimeEntries = allEntries.filter((entry) => entry.title === 'Project Runtime')
  const removeProjectLabel =
    confirmingRemove === repo.id ? 'Confirm Remove Project' : 'Remove Project'

  const hooksSection =
    !isFolder && (forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, hooksEntries)) ? (
      <RepositoryHooksSection
        key="hooks"
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
    ) : null

  // Why: Identity (name, icon, base ref) stays at the top so it's the first
  // thing a user sees. Setup commands follow immediately because they're the
  // most-edited surface and should beat MCP/symlinks/sparse-presets.
  const visibleSections = [
    forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, identityEntries) ? (
      <section key="identity" className="relative space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 pr-12">
            <h3 className="text-sm font-semibold">
              {translate('auto.components.settings.RepositoryPane.499a437335', 'Identity')}
            </h3>
            <p className="text-muted-foreground text-xs">
              {translate(
                'auto.components.settings.RepositoryPane.b0a0c14a1c',
                'Project-specific display details for the sidebar and tabs.'
              )}
            </p>
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
              'Remove this project from Yiru on all configured hosts.'
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

        <SearchableSetting
          title={translate('auto.components.settings.RepositoryPane.c7ef4415de', 'Display Name')}
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
          title={translate('auto.components.settings.RepositoryPane.26fef02bf3', 'Project Icon')}
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
      </section>
    ) : null,
    hooksSection,
    !isFolder &&
    (forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, sourceControlAiEntries)) ? (
      <RepositorySourceControlAiSection
        key="source-control-ai"
        repo={repo}
        updateRepo={updateSelectedRepo}
      />
    ) : null,
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
    // removed (#63) — symlinks are always local now, so the SSH exclusion
    // that used to gate this section never fires.
    !isFolder &&
    (forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, symlinkEntries)) ? (
      <WorktreeSymlinksSection key="symlinks" repo={repo} updateRepo={updateSelectedRepo} />
    ) : null,
    !isFolder &&
    (forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, sparsePresetEntries)) ? (
      <SparsePresetSettingsSection key="sparse-presets" repoId={repo.id} />
    ) : null,
    !isFolder && (forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, mcpEntries)) ? (
      <McpConfigSection key="mcp-configs" repo={repo} />
    ) : null
  ].filter(Boolean)

  return (
    <div ref={setRepositoryPaneRootRef} className="space-y-8">
      {visibleSections.map((section, index) => (
        <div key={index} className="space-y-8">
          {index > 0 ? <Separator /> : null}
          {section}
        </div>
      ))}
    </div>
  )
}
