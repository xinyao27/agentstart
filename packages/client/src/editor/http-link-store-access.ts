import type { WorkspacePortScanResult } from '@agentstart/protocol'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'

export type LocalhostLinkRepo = {
  id: string
  displayName: string
}

export type LocalhostLinkProject = LocalhostLinkRepo

export type LocalhostLinkWorktree = {
  id: string
  projectId?: string
}

export type HttpLinkStore = {
  settings?: Partial<
    Pick<GlobalSettings, 'activeRuntimeEnvironmentId' | 'localhostWorktreeLabelsEnabled'>
  > | null
  setActiveWorktree: (worktreeId: string) => void
  createBrowserTab: (worktreeId: string, url: string, opts: { activate: boolean }) => unknown
  activeWorktreeId?: string | null
  repos?: LocalhostLinkRepo[]
  projects?: LocalhostLinkProject[]
  worktreesByRepo?: Record<string, LocalhostLinkWorktree[]>
  allWorktrees?: () => LocalhostLinkWorktree[]
  workspacePortScan?: { result: WorkspacePortScanResult } | null
  workspacePortScansByKey?: Record<string, WorkspacePortScanResult>
}

type StoreAccessor = () => HttpLinkStore

// Why: this leaf module keeps store registration outside http-link-routing's
// shell-client dependency graph, so store initialization stays acyclic during HMR.
let storeAccessor: StoreAccessor | null = null

export function registerHttpLinkStoreAccessor(accessor: StoreAccessor): void {
  storeAccessor = accessor
}

export function readHttpLinkStore(): HttpLinkStore | null {
  return storeAccessor?.() ?? null
}
