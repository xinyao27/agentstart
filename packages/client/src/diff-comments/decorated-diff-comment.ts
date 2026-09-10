import type { DiffComment } from '@agentstart/protocol/git/diff-review'

/** A stored diff comment plus the presentation fields a surface renders with. */
export type DecoratedDiffComment = DiffComment & {
  author?: string
  authorAvatarUrl?: string
  createdAtLabel?: string
  url?: string
  canDelete?: boolean
  canEdit?: boolean
}
