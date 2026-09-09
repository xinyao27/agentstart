import type { HookCommandSourcePolicy } from '../worktree/hooks.js'

export function resolveHookCommandSourcePolicy(
  policy: unknown,
  { hasLocalScript }: { hasLocalScript: boolean }
): HookCommandSourcePolicy {
  if (policy === 'local-only' || policy === 'run-both' || policy === 'shared-only') {
    return policy
  }

  if (policy === undefined && hasLocalScript) {
    return 'local-only'
  }

  return 'shared-only'
}
