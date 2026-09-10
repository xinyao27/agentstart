import type { BrowserPage, BrowserWorkspace } from '@agentstart/protocol/workspace/browser-session'
import { createBrowserUuid } from '~renderer/browser/uuid'
import type { AppState } from '~renderer/store/types'

import type {
  BrowserTabPageState,
  CreateBrowserTabOptions,
  HostBrowserTabProjection
} from './types'

export function createNativeChromeTabRecord(
  worktreeId: string,
  url: string,
  options?: CreateBrowserTabOptions
): BrowserWorkspace {
  const createdAt = Date.now()
  return {
    id: options?.workspaceId ?? createBrowserUuid(),
    worktreeId,
    url,
    title: options?.title ?? url,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt,
    pageIds: options?.pageId ? [options.pageId] : [],
    activePageId: options?.pageId ?? null,
    sessionProfileId: options?.sessionProfileId,
    sessionPartition: options?.sessionPartition
  }
}

export function buildHostBrowserTabUpsert(
  state: AppState,
  projection: HostBrowserTabProjection
): { patch: Partial<AppState>; workspace: BrowserWorkspace } {
  const records = createHostProjectionRecords(projection)
  const browserTabsByWorktree = Object.fromEntries(
    Object.entries(state.browserTabsByWorktree).map(([worktreeId, workspaces]) => [
      worktreeId,
      workspaces.filter((workspace) => workspace.id !== records.workspace.id)
    ])
  )
  const existing = state.browserTabsByWorktree[projection.worktreeId]?.find(
    (workspace) => workspace.id === records.workspace.id
  )
  const workspace = existing
    ? { ...records.workspace, createdAt: existing.createdAt }
    : records.workspace
  browserTabsByWorktree[projection.worktreeId] = [
    ...(browserTabsByWorktree[projection.worktreeId] ?? []),
    workspace
  ]
  return {
    workspace,
    patch: {
      browserTabsByWorktree,
      browserPagesByWorkspace: {
        ...state.browserPagesByWorkspace,
        [workspace.id]: [
          {
            ...records.page,
            createdAt: state.browserPagesByWorkspace[workspace.id]?.[0]?.createdAt ?? Date.now()
          }
        ]
      },
      ...(projection.activate
        ? {
            ...(state.activeWorktreeId === projection.worktreeId
              ? { activeBrowserTabId: workspace.id }
              : {}),
            activeBrowserTabIdByWorktree: {
              ...state.activeBrowserTabIdByWorktree,
              [projection.worktreeId]: workspace.id
            }
          }
        : {})
    }
  }
}

export function buildBrowserWorkspaceStage(
  state: AppState,
  workspace: BrowserWorkspace,
  activate: boolean
): Partial<AppState> {
  return {
    browserTabsByWorktree: {
      ...state.browserTabsByWorktree,
      [workspace.worktreeId]: [
        ...(state.browserTabsByWorktree[workspace.worktreeId] ?? []).filter(
          (candidate) => candidate.id !== workspace.id
        ),
        workspace
      ]
    },
    ...(activate && state.activeWorktreeId === workspace.worktreeId
      ? { activeBrowserTabId: workspace.id }
      : {}),
    ...(activate
      ? {
          activeBrowserTabIdByWorktree: {
            ...state.activeBrowserTabIdByWorktree,
            [workspace.worktreeId]: workspace.id
          }
        }
      : {})
  }
}

export function buildHostBrowserTabRemoval(
  state: AppState,
  browserIdentifier: string
): Partial<AppState> {
  const owningEntry = findBrowserWorkspace(state, browserIdentifier)
  if (!owningEntry) {
    return {}
  }
  const { workspace, worktreeId: owningWorktree } = owningEntry
  const browserPagesByWorkspace = { ...state.browserPagesByWorkspace }
  const browserCertificateFailuresByPageId = { ...state.browserCertificateFailuresByPageId }
  const remoteBrowserPageHandlesByPageId = { ...state.remoteBrowserPageHandlesByPageId }
  for (const page of browserPagesByWorkspace[workspace.id] ?? []) {
    delete browserCertificateFailuresByPageId[page.id]
    delete remoteBrowserPageHandlesByPageId[page.id]
  }
  delete browserPagesByWorkspace[workspace.id]
  return {
    browserTabsByWorktree: {
      ...state.browserTabsByWorktree,
      [owningWorktree]: state.browserTabsByWorktree[owningWorktree]!.filter(
        (candidate) => candidate.id !== workspace.id
      )
    },
    browserPagesByWorkspace,
    browserCertificateFailuresByPageId,
    remoteBrowserPageHandlesByPageId,
    activeBrowserTabId: state.activeBrowserTabId === workspace.id ? null : state.activeBrowserTabId,
    activeBrowserTabIdByWorktree: {
      ...state.activeBrowserTabIdByWorktree,
      ...(state.activeBrowserTabIdByWorktree[owningWorktree] === workspace.id
        ? { [owningWorktree]: null }
        : {})
    }
  }
}

export function findBrowserWorkspace(
  state: Pick<AppState, 'browserPagesByWorkspace' | 'browserTabsByWorktree'>,
  browserIdentifier: string
): { workspace: BrowserWorkspace; worktreeId: string } | null {
  for (const [worktreeId, workspaces] of Object.entries(state.browserTabsByWorktree)) {
    const workspace = workspaces.find(
      (candidate) =>
        candidate.id === browserIdentifier ||
        (state.browserPagesByWorkspace[candidate.id] ?? []).some(
          (page) => page.id === browserIdentifier
        )
    )
    if (workspace) {
      return { workspace, worktreeId }
    }
  }
  return null
}

export function buildBrowserPagePatch(
  state: AppState,
  pageId: string,
  updates: BrowserTabPageState
): Partial<AppState> {
  let owningWorkspaceId: string | null = null
  const browserPagesByWorkspace = Object.fromEntries(
    Object.entries(state.browserPagesByWorkspace).map(([workspaceId, pages]) => {
      const nextPages = pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }
        owningWorkspaceId = workspaceId
        return { ...page, ...updates }
      })
      return [workspaceId, nextPages]
    })
  )
  if (!owningWorkspaceId) {
    return {}
  }
  return {
    browserPagesByWorkspace,
    browserTabsByWorktree: Object.fromEntries(
      Object.entries(state.browserTabsByWorktree).map(([worktreeId, workspaces]) => [
        worktreeId,
        workspaces.map((workspace) =>
          workspace.id === owningWorkspaceId ? { ...workspace, ...updates } : workspace
        )
      ])
    )
  }
}

function createHostProjectionRecords(projection: HostBrowserTabProjection): {
  page: BrowserPage
  workspace: BrowserWorkspace
} {
  const createdAt = Date.now()
  const workspace = createNativeChromeTabRecord(projection.worktreeId, projection.url, {
    pageId: projection.browserPageId,
    title: projection.title,
    workspaceId: projection.workspaceId ?? projection.browserPageId
  })
  return {
    workspace,
    page: {
      id: projection.browserPageId,
      workspaceId: workspace.id,
      worktreeId: projection.worktreeId,
      url: projection.url,
      title: projection.title,
      loading: false,
      faviconUrl: null,
      canGoBack: false,
      canGoForward: false,
      loadError: null,
      browserRuntimeEnvironmentId: projection.browserRuntimeEnvironmentId,
      createdAt
    }
  }
}
