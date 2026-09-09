import type {
  WorktreeDiffComment,
  WorktreeMobileDiffReviewFile,
  WorktreeValue
} from '../worktree-types.js'
export type DiffComment = WorktreeDiffComment
export type DiffCommentSource = NonNullable<WorktreeDiffComment['source']>
export type DiffReviewScope = WorktreeMobileDiffReviewFile['scope']
export type MobileDiffReviewFileState = WorktreeMobileDiffReviewFile
export type MobileDiffReviewState = NonNullable<WorktreeValue['mobileDiffReview']>
