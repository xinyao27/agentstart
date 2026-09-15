import type { ShellSessionDocumentValue, ShellSessionSnapshot } from '@agentstart/protocol'

type PendingSessionEdit = {
  base: ShellSessionDocumentValue
  desired: ShellSessionDocumentValue
}

export type AuthoritativeBaseState = {
  snapshot: ShellSessionSnapshot
  input: ShellSessionDocumentValue
  pending: PendingSessionEdit | null
}

/** Adopt the accepted write as the base of the next edit.
 *
 *  Why: the authority rewrites part of what a writer sends — it preserves PTY
 *  bindings, prunes renderer buffers, drops keys its schema does not carry, and
 *  deletes the owners a removal pruned. A base kept from this client's own
 *  optimistic document would then disagree with the document on the server for
 *  every rewritten path, and the next edit to one of them would surface as a
 *  change no second client ever made. A pending edit keeps the user's own values
 *  as the view a reader gets back, while its base moves to what the server now
 *  holds. */
export function adoptAuthoritativeBase(state: AuthoritativeBaseState): void {
  const authoritative = state.snapshot.session
  const pending = state.pending
  if (pending) {
    pending.base = authoritative
  }
  state.input = structuredClone(pending ? pending.desired : authoritative)
}
