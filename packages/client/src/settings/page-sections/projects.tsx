import {
  type ExecutionHostId,
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '@agentstart/protocol/host/identity'
import type { Project, ProjectHostSetup } from '@agentstart/protocol/project/model'
import type { Repo } from '@agentstart/protocol/project/repository'
import { getRepoHostIdentity } from '~renderer/repo/state/host-identity'
import type { AppState } from '~renderer/store/types'

import { translate } from '../../i18n/i18n'
import { getSettingsProjectHostRepo, type SettingsProject } from '../project-list'
import { RepositoryPane } from '../repository/pane'
import type { SettingsSearchEntry } from '../search'
import { SettingsSection } from '../section'
import type { ProjectHooksState } from '../use-project-hooks'

type ProjectSectionsProps = {
  getSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  isMounted: (sectionId: string) => boolean
  isWindowsTerminalHost: boolean
  projectHostSetups: readonly ProjectHostSetup[]
  projects: readonly Project[]
  removeProject: (setups: readonly ProjectHostSetup[]) => Promise<void>
  repoHooksMap: Readonly<Record<string, ProjectHooksState>>
  repos: readonly Repo[]
  settingsProjectHostSelection: Readonly<Record<string, ExecutionHostId | undefined>>
  settingsProjectList: readonly SettingsProject[]
  updateProject: AppState['updateProject']
  updateRepo: AppState['updateRepo']
  windowsTerminalCapabilities: {
    isLoading: boolean
    wslAvailable: boolean
    wslDistros: string[]
  }
}

export function ProjectSections({
  getSearchEntries,
  isMounted,
  isWindowsTerminalHost,
  projectHostSetups,
  projects,
  removeProject,
  repoHooksMap,
  repos,
  settingsProjectHostSelection,
  settingsProjectList,
  updateProject,
  updateRepo,
  windowsTerminalCapabilities
}: ProjectSectionsProps): React.JSX.Element {
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const projectByRepoId = new Map<string, Project>()
  for (const setup of projectHostSetups) {
    const project = projectById.get(setup.projectId)
    if (project && setup.repoId.trim()) {
      projectByRepoId.set(setup.repoId, project)
    }
  }

  return (
    <>
      {settingsProjectList.map((settingsProject) => {
        const repoSectionId = `repo-${settingsProject.representativeRepoId}`
        const repo = getSettingsProjectHostRepo(
          settingsProject,
          repos,
          settingsProjectHostSelection[settingsProject.projectId]
        )
        if (!repo) {
          return null
        }
        const repoHostIdentity = getRepoHostIdentity(repo)
        const repoHooksState = repoHooksMap[repoHostIdentity]
        const project = projectByRepoId.get(repo.id) ?? settingsProject.project

        return (
          <SettingsSection
            key={repoSectionId}
            id={repoSectionId}
            title={translate(
              'auto.components.settings.Settings.3bf149e873',
              'Project Settings > {{value0}}',
              { value0: project.displayName }
            )}
            description={repo.path}
            searchEntries={getSearchEntries(repoSectionId)}
          >
            {isMounted(repoSectionId) ? (
              <RepositoryPane
                key={repoHostIdentity}
                repo={repo}
                yamlHooks={repoHooksState?.hooks ?? null}
                hasHooksFile={repoHooksState?.hasHooks ?? false}
                hooksInspectionReady={Boolean(repoHooksState)}
                mayNeedUpdate={repoHooksState?.mayNeedUpdate ?? false}
                updateRepo={updateRepo}
                removeProject={() => void removeProject(settingsProject.setups)}
                project={project}
                isLocalWindowsProject={
                  getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID && isWindowsTerminalHost
                }
                wslAvailable={windowsTerminalCapabilities.wslAvailable}
                wslDistros={windowsTerminalCapabilities.wslDistros}
                wslCapabilitiesLoading={windowsTerminalCapabilities.isLoading}
                updateProject={updateProject}
              />
            ) : null}
          </SettingsSection>
        )
      })}
    </>
  )
}
