export type CreateSparseCheckoutRequest = {
  directories: string[]
  /** Set when the directories came from a saved preset and the user did not
   *  modify them — recorded on WorktreeMeta so the worktree can show "from
   *  preset X" later. Cleared if the user edited the textarea. */
  presetId?: string
}
