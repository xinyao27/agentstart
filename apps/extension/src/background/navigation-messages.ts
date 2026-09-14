import {
  focusOrCreateExternalUrl,
  focusOrCreatePage,
  focusOrCreateWorkspace,
  type GlobalPage,
  type WorkspaceNavigationTarget
} from './workspace-navigation'

type Respond = (response: unknown) => void

export function handleNavigationMessage(message: object, respond: Respond): boolean | null {
  const type = Reflect.get(message, 'type')
  if (type === 'open-workspace') {
    return respondToNavigation(
      parseWorkspaceNavigation(message),
      respond,
      ({ sourceWindowId, target }) => focusOrCreateWorkspace(target, sourceWindowId)
    )
  }
  if (type === 'open-page') {
    return respondToNavigation(parsePageNavigation(message), respond, ({ page, sourceWindowId }) =>
      focusOrCreatePage(page, sourceWindowId)
    )
  }
  if (type === 'open-external-url') {
    return respondToNavigation(parseExternalTarget(message), respond, (target) =>
      focusOrCreateExternalUrl(target.url, target.projectId)
    )
  }
  return null
}

function parsePageNavigation(
  message: object
): { page: GlobalPage; sourceWindowId?: number } | null {
  const page = parseGlobalPage(Reflect.get(message, 'page'))
  const sourceWindowId = parseSourceWindowId(Reflect.get(message, 'sourceWindowId'))
  return page && sourceWindowId !== null
    ? { page, ...(sourceWindowId === undefined ? {} : { sourceWindowId }) }
    : null
}

function parseWorkspaceNavigation(
  message: object
): { sourceWindowId?: number; target: WorkspaceNavigationTarget } | null {
  const target = parseWorkspaceTarget(Reflect.get(message, 'target'))
  const sourceWindowId = parseSourceWindowId(Reflect.get(message, 'sourceWindowId'))
  return target && sourceWindowId !== null
    ? { target, ...(sourceWindowId === undefined ? {} : { sourceWindowId }) }
    : null
}

function respondToNavigation<T>(
  input: T | null,
  respond: Respond,
  navigate: (input: T) => Promise<void>
): boolean {
  if (!input) {
    respond({ error: 'invalid_navigation_target', ok: false })
    return false
  }
  void navigate(input).then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

function parseWorkspaceTarget(value: unknown): WorkspaceNavigationTarget | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const projectId = Reflect.get(value, 'projectId')
  const sessionId = Reflect.get(value, 'sessionId')
  const worktreeId = Reflect.get(value, 'worktreeId')
  if (typeof projectId !== 'string' || projectId.length === 0) {
    return null
  }
  if (sessionId !== undefined && typeof sessionId !== 'string') {
    return null
  }
  if (worktreeId !== undefined && (typeof worktreeId !== 'string' || worktreeId.length === 0)) {
    return null
  }
  return {
    projectId,
    ...(typeof sessionId === 'string' ? { sessionId } : {}),
    ...(typeof worktreeId === 'string' ? { worktreeId } : {})
  }
}

function parseExternalTarget(value: object): { projectId?: string; url: string } | null {
  const projectId = Reflect.get(value, 'projectId')
  const url = Reflect.get(value, 'url')
  if (typeof url !== 'string' || (projectId !== undefined && typeof projectId !== 'string')) {
    return null
  }
  return { url, ...(typeof projectId === 'string' ? { projectId } : {}) }
}

function parseGlobalPage(value: unknown): GlobalPage | null {
  return value === 'activity' || value === 'mobile' || value === 'skills' || value === 'settings'
    ? value
    : null
}

function parseSourceWindowId(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined
  }
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
}
