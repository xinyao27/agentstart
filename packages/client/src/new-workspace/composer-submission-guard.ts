const HOOK_TRUST_MODAL_ID = 'confirm-agentstart-yaml-hooks'

export type ComposerSubmissionGuard = {
  begin: () => number
  isCurrent: (submissionId: number) => boolean
  cancel: () => void
}

// Why: hook trust temporarily replaces the composer modal, but its decision
// resolves the same async submit rather than abandoning it.
export function shouldPreserveComposerSubmissionOnUnmount(
  activeModal: string | null | undefined
): boolean {
  return activeModal === HOOK_TRUST_MODAL_ID
}

/** Keeps only the newest async composer submission eligible to create a workspace. */
export function createComposerSubmissionGuard(): ComposerSubmissionGuard {
  let generation = 0
  return {
    begin: () => {
      generation += 1
      return generation
    },
    isCurrent: (submissionId) => generation === submissionId,
    cancel: () => {
      generation += 1
    }
  }
}
