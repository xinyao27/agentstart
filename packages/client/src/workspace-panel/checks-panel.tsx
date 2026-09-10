import React from 'react'

import { useChecksPanelAgentActions } from './checks-panel/agent-actions'
import { useChecksPanelChecksLoading } from './checks-panel/checks-loading'
import { useChecksPanelCommentActions } from './checks-panel/comment-actions-controller'
import { useChecksPanelCommentsLoading } from './checks-panel/comments-loading'
import { useChecksPanelCreateReview } from './checks-panel/create-review'
import { ChecksPanelEmptyStateView } from './checks-panel/empty-state-view'
import { useChecksPanelEntryAndEdit } from './checks-panel/entry-and-edit'
import { useChecksPanelGenerationActions } from './checks-panel/generation-actions'
import { useChecksPanelGenerationDefaults } from './checks-panel/generation-defaults'
import { useChecksPanelGenerationFields } from './checks-panel/generation-fields'
import { useChecksPanelPollingEffects } from './checks-panel/polling-effects'
import { useChecksPanelRefreshAction } from './checks-panel/refresh-action'
import { useChecksPanelReviewContext } from './checks-panel/review-context'
import { useChecksPanelReviewCreation } from './checks-panel/review-creation-actions'
import { useChecksPanelReviewIdentity } from './checks-panel/review-identity'
import { useChecksPanelReviewMutations } from './checks-panel/review-mutations'
import { ChecksPanelReviewView } from './checks-panel/review-view'
import { useChecksPanelStateCore } from './checks-panel/state-core'
import { useChecksPanelStatusEffects } from './checks-panel/status-effects'
import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from './right-sidebar-panel-source'

function LocalChecksPanel({
  isVisible,
  workspacePanelTabId
}: {
  isVisible: boolean
  workspacePanelTabId?: string
}): React.JSX.Element | null {
  const core = useChecksPanelStateCore(isVisible)
  const reviewIdentity = useChecksPanelReviewIdentity(core)
  const reviewContext = useChecksPanelReviewContext(reviewIdentity)
  const generationDefaults = useChecksPanelGenerationDefaults(reviewContext)
  const generationActions = useChecksPanelGenerationActions(generationDefaults)
  const generationFields = useChecksPanelGenerationFields(generationActions)
  const statusEffects = useChecksPanelStatusEffects(generationFields)
  const pollingEffects = useChecksPanelPollingEffects(statusEffects)
  const checksLoading = useChecksPanelChecksLoading(pollingEffects)
  const commentsLoading = useChecksPanelCommentsLoading(checksLoading)
  const refreshAction = useChecksPanelRefreshAction(commentsLoading)
  const entryAndEdit = useChecksPanelEntryAndEdit(refreshAction)
  const commentActions = useChecksPanelCommentActions(entryAndEdit)
  const agentActions = useChecksPanelAgentActions(commentActions)
  const reviewMutations = useChecksPanelReviewMutations(agentActions)
  const reviewCreation = useChecksPanelReviewCreation(reviewMutations)
  const context = useChecksPanelCreateReview(reviewCreation)

  if (!context.activeWorktree || context.isFolder || !context.activeReview) {
    return <ChecksPanelEmptyStateView context={context} />
  }
  return <ChecksPanelReviewView context={context} workspacePanelTabId={workspacePanelTabId} />
}

export default function ChecksPanel({
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  isVisible = true,
  workspacePanelTabId
}: {
  source?: RightSidebarPanelSource
  isVisible?: boolean
  workspacePanelTabId?: string
}): React.JSX.Element | null {
  void source
  return <LocalChecksPanel isVisible={isVisible} workspacePanelTabId={workspacePanelTabId} />
}
