import { useSourceControlActionModel } from './controller/action-model'
import { useSourceControlBranchCompare } from './controller/branch-compare'
import { useSourceControlBulkActions } from './controller/bulk-actions'
import { useSourceControlCommitAction } from './controller/commit-action'
import { useSourceControlCommitGeneration } from './controller/commit-generation'
import { useSourceControlConflictActions } from './controller/conflict-actions'
import { useSourceControlCreateReview } from './controller/create-review'
import { useSourceControlCreateReviewIntent } from './controller/create-review-intent'
import { useSourceControlCreateReviewPrerequisites } from './controller/create-review-prerequisites'
import { useSourceControlCreateReviewSubmit } from './controller/create-review-submit'
import { useSourceControlFileModel } from './controller/file-model'
import { useSourceControlFileMutations } from './controller/file-mutations'
import { useSourceControlFileOpen } from './controller/file-open'
import { useSourceControlHistory } from './controller/history'
import { useSourceControlHostedReviewState } from './controller/hosted-review-state'
import { useSourceControlInteractionState } from './controller/interaction-state'
import { useSourceControlLifecycle } from './controller/lifecycle'
import { useSourceControlRemoteActions } from './controller/remote-actions'
import { useSourceControlReviewDialog } from './controller/review-dialog'
import { useSourceControlReviewGeneration } from './controller/review-generation'
import { useSourceControlStatusRefresh } from './controller/status-refresh'
import { useSourceControlStoreState } from './controller/store-state'

export function useSourceControlController({ isVisible }: { isVisible: boolean }) {
  const storeState = useSourceControlStoreState({ isVisible })
  const interactionState = useSourceControlInteractionState(storeState)
  const statusRefresh = useSourceControlStatusRefresh(interactionState)
  const hostedReviewState = useSourceControlHostedReviewState(statusRefresh)
  const fileModel = useSourceControlFileModel(hostedReviewState)
  const lifecycle = useSourceControlLifecycle(fileModel)
  const commitAction = useSourceControlCommitAction(lifecycle)
  const commitGeneration = useSourceControlCommitGeneration(commitAction)
  const remoteActions = useSourceControlRemoteActions(commitGeneration)
  const conflictActions = useSourceControlConflictActions(remoteActions)
  const reviewGeneration = useSourceControlReviewGeneration(conflictActions)
  const reviewDialog = useSourceControlReviewDialog(reviewGeneration)
  const createReview = useSourceControlCreateReview(reviewDialog)
  const createReviewSubmit = useSourceControlCreateReviewSubmit(createReview)
  const createReviewPrerequisites = useSourceControlCreateReviewPrerequisites(createReviewSubmit)
  const createReviewIntent = useSourceControlCreateReviewIntent(createReviewPrerequisites)
  const actionModel = useSourceControlActionModel(createReviewIntent)
  const fileOpen = useSourceControlFileOpen(actionModel)
  const bulkActions = useSourceControlBulkActions(fileOpen)
  const branchCompare = useSourceControlBranchCompare(bulkActions)
  const history = useSourceControlHistory(branchCompare)
  return useSourceControlFileMutations(history)
}

export type SourceControlController = ReturnType<typeof useSourceControlController>
