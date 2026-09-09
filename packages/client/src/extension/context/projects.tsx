import { useQuery } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { GitBranch } from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectContextResolveQuery } from '~renderer/runtime/project-context-target'
import { workspacePortsScanQuery } from '~renderer/runtime/workspace-ports-target'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { getExtensionHostNavigation } from '../navigation'
import { projectDisplayName } from '../project-display-name'
import { ColorWriteback } from './color-writeback'
import { CommentDraft } from './comment-draft'
import { ConsoleSensor } from './console-sensor'
import { ElementPicker } from './element-picker'
import { ForgeWorktree } from './forge-worktree'
import { NetworkMock } from './network-mock'
import { identifyForgePage, identifyLocalPage } from './page-identity'
import { PerformanceAudit } from './performance-audit'
import { ProjectBookmarks } from './project-bookmarks'
import { ReplayControls } from './replay-controls'
import { VisualRegression } from './visual-regression'

type ContextMatch = {
  displayName: string
  path: string
  projectId: string
  worktreeId?: string
}

const LOCAL_DAEMON_TARGET = { kind: 'local' } as const

export function ContextProjects(): React.JSX.Element | null {
  const capabilities = getExtensionBrowserCapabilities()
  const projectCatalog = useProjectCatalog()
  const navigation = getExtensionHostNavigation()
  const awareness = useQuery({
    queryKey: ['extension-host', 'context-awareness'],
    queryFn: capabilities.isContextAwarenessEnabled
  })
  const activePage = useQuery({
    enabled: awareness.data === true,
    queryKey: ['extension-host', 'active-page'],
    queryFn: navigation.readActivePageUrl,
    refetchInterval: 1_000
  })
  const forgeIdentity = activePage.data ? identifyForgePage(activePage.data) : null
  const localIdentity = activePage.data ? identifyLocalPage(activePage.data) : null
  const remoteProjects = useQuery(
    projectContextResolveQuery(forgeIdentity ? { canonicalKey: forgeIdentity.canonicalKey } : null)
  )
  const workspacePorts = useQuery({
    ...workspacePortsScanQuery(LOCAL_DAEMON_TARGET),
    enabled: Boolean(localIdentity)
  })
  const matches: ContextMatch[] = forgeIdentity
    ? (remoteProjects.data?.matches ?? [])
    : localIdentity
      ? (workspacePorts.data?.ports ?? []).flatMap((port) =>
          port.kind === 'workspace' && port.port === localIdentity.port
            ? [
                {
                  displayName: projectDisplayName(
                    projectCatalog.repos,
                    port.owner.repoId,
                    port.owner.displayName
                  ),
                  path: port.owner.path,
                  projectId: port.owner.repoId,
                  worktreeId: port.owner.worktreeId
                }
              ]
            : []
        )
      : []
  const identity = forgeIdentity ?? localIdentity
  if (awareness.data !== true) {
    return null
  }
  if (!identity || matches.length === 0) {
    return null
  }
  return (
    <section className="border-sidebar-border border-b px-2 py-2">
      <p className="text-muted-foreground px-1 pb-1 text-xs">
        {translate('extension.context.matches', '{{page}} belongs to', { page: identity.title })}
      </p>
      {matches.map((project) => (
        <div key={project.projectId}>
          <Button
            type="button"
            variant="ghost"
            size="sidebar-row"
            onClick={() => navigation.openWorkspace({ projectId: project.projectId })}
          >
            <GitBranch className="text-muted-foreground size-4" />
            <span className="truncate">{project.displayName}</span>
          </Button>
          {localIdentity && project.worktreeId ? (
            <ReplayControls
              pageUrl={localIdentity.url}
              projectId={project.projectId}
              worktreeId={project.worktreeId}
            />
          ) : null}
          {localIdentity && project.worktreeId ? (
            <ConsoleSensor
              pageUrl={localIdentity.url}
              projectId={project.projectId}
              worktreeId={project.worktreeId}
            />
          ) : null}
          {localIdentity && project.worktreeId ? (
            <ElementPicker projectId={project.projectId} worktreeId={project.worktreeId} />
          ) : null}
          {localIdentity && project.worktreeId ? (
            <VisualRegression
              pageUrl={localIdentity.url}
              projectId={project.projectId}
              worktreeId={project.worktreeId}
            />
          ) : null}
          {localIdentity && project.worktreeId ? (
            <PerformanceAudit projectId={project.projectId} worktreeId={project.worktreeId} />
          ) : null}
          {localIdentity && project.worktreeId ? (
            <ColorWriteback projectId={project.projectId} worktreeId={project.worktreeId} />
          ) : null}
          {forgeIdentity?.url.startsWith('https://github.com/') ? (
            <CommentDraft identity={forgeIdentity} projectId={project.projectId} />
          ) : null}
          {forgeIdentity ? (
            <ForgeWorktree identity={forgeIdentity} projectId={project.projectId} />
          ) : null}
          {activePage.data ? (
            <ProjectBookmarks
              displayName={project.displayName}
              pageUrl={activePage.data}
              projectId={project.projectId}
            />
          ) : null}
        </div>
      ))}
      {localIdentity ? <NetworkMock pageUrl={localIdentity.url} /> : null}
    </section>
  )
}
