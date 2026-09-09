// Inline setup/onboarding terminals have no backing worktree. Branding their
// per-panel id lets the terminal RPC layer resolve them to the runtime home.
export const EPHEMERAL_SETUP_TERMINAL_WORKTREE_ID_PREFIX = 'ephemeral-setup-terminal:'

/**
 * Brand a per-panel setup-terminal id for runtime home-directory resolution.
 */
export function brandEphemeralSetupTerminalWorktreeId(panelId: string): string {
  return isEphemeralSetupTerminalWorktreeId(panelId)
    ? panelId
    : `${EPHEMERAL_SETUP_TERMINAL_WORKTREE_ID_PREFIX}${panelId}`
}

/** Whether `worktreeId` is a branded ephemeral setup-terminal id. */
export function isEphemeralSetupTerminalWorktreeId(worktreeId: string): boolean {
  return worktreeId.startsWith(EPHEMERAL_SETUP_TERMINAL_WORKTREE_ID_PREFIX)
}
