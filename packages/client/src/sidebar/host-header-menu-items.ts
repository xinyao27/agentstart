import type { ExecutionHostKind } from '@yiru/protocol/host/identity'
import type { RuntimeCompatVerdict } from '@yiru/protocol/runtime-compatibility'
import type { ExecutionHostHealth } from '~renderer/execution-host-registry'

// Why: the host-header dropdown shows different lifecycle actions per host kind.
// Keeping the availability rules in a pure function makes them unit-testable
// without rendering the sidebar.
// Why: no 'focus' action here — the host scope strip is the single scoping
// control (the design doc forbids a separate focused-host toggle), and
// decluttering is served by collapsing the section.
export type HostHeaderMenuAction = 'rename' | 'manage' | 'runtime-check-connection' | 'remove'

export type HostHeaderMenuModel = {
  /** Lifecycle/navigation actions, in display order. */
  actions: HostHeaderMenuAction[]
  /** Present only when the host is blocked on a compatibility verdict. */
  blocked: {
    reason: 'client-too-old' | 'server-too-old'
  } | null
}

export type HostHeaderMenuInput = {
  kind: ExecutionHostKind
  health: ExecutionHostHealth
  compatibility?: RuntimeCompatVerdict
}

export function buildHostHeaderMenuModel(input: HostHeaderMenuInput): HostHeaderMenuModel {
  // Why: Rename edits only the client-side display label, so it's offered for
  // every host kind including local.
  const actions: HostHeaderMenuAction[] = ['rename']

  switch (input.kind) {
    case 'runtime':
      actions.push('runtime-check-connection')
      break
    case 'local':
      break
  }

  // Manage host… always closes out the list as the catch-all deep link.
  actions.push('manage')

  // Why: local cannot be removed; runtime lifecycle remains settings-owned.
  if (input.kind === 'runtime') {
    actions.push('remove')
  }

  const blocked =
    input.health === 'blocked' && input.compatibility?.kind === 'blocked'
      ? { reason: input.compatibility.reason }
      : null

  return { actions, blocked }
}
