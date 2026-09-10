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
      parseWorkspaceTarget(Reflect.get(message, 'target')),
      respond,
      (target) => focusOrCreateWorkspace(target)
    )
  }
  if (type === 'open-page') {
    return respondToNavigation(parseGlobalPage(Reflect.get(message, 'page')), respond, (page) =>
      focusOrCreatePage(page)
    )
  }
  if (type === 'open-external-url') {
    return respondToNavigation(parseExternalTarget(message), respond, (target) =>
      focusOrCreateExternalUrl(target.url, target.projectId)
    )
  }
  return null
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
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'projectId') !== 'string'
  ) {
    return null
  }
  const sessionId = Reflect.get(value, 'sessionId')
  const worktreeId = Reflect.get(value, 'worktreeId')
  const dedicated = Reflect.get(value, 'dedicated')
  if (sessionId !== undefined && typeof sessionId !== 'string') {
    return null
  }
  if (worktreeId !== undefined && typeof worktreeId !== 'string') {
    return null
  }
  if (
    (dedicated !== undefined && typeof dedicated !== 'boolean') ||
    (dedicated === true && typeof worktreeId !== 'string')
  ) {
    return null
  }
  return {
    ...(dedicated === true ? { dedicated: true } : {}),
    projectId: Reflect.get(value, 'projectId'),
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
  return value === 'activity' ||
    value === 'mobile' ||
    value === 'search' ||
    value === 'skills' ||
    value === 'settings'
    ? value
    : null
}
