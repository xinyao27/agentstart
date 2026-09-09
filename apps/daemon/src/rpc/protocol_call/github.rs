use super::{
    PeerKind, ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse,
    ProtocolRequest, ProtocolRouter, github_protocol, github_service,
};

pub(super) enum Method {
    ShellServiceGetViewer,
    ShellServiceEnqueuePrRefresh,
    ShellServiceReportVisiblePrRefreshCandidates,
    ShellServiceCheckYiruStarred,
    ShellServiceStarYiru,
    ServiceGetRepoSlug,
    ServiceGetRepoUpstream,
    ServiceGetRateLimit,
    ServiceListWorkItems,
    ServiceListLabels,
    ServiceListAssignableUsers,
    ServiceGetWorkItem,
    ServiceGetWorkItemByOwnerRepo,
    ServiceGetWorkItemDetails,
    ServiceGetPrForBranch,
    ServiceRefreshPrForBranch,
    ServiceGetPrChecks,
    ServiceGetPrCheckDetails,
    ServiceRerunPrChecks,
    ServiceGetPrComments,
    ServiceGetPrFileContents,
    ServiceResolveReviewThread,
    ServiceSetPrFileViewed,
    ServiceUpdatePrTitle,
    ServiceUpdatePr,
    ServiceUpdatePrState,
    ServiceMergePr,
    ServiceSetPrAutoMerge,
    ServiceRequestPrReviewers,
    ServiceRemovePrReviewers,
    ServiceAddPrComment,
    ServiceAddPrReviewComment,
    ServiceAddPrReviewCommentReply,
    ServiceCreateCommentDraft,
    ServiceGetHostedReviewForBranch,
    ServiceGetHostedReviewCreationEligibility,
    ServiceCreateHostedReview,
    ServiceSubscribeEvents,
}

impl ProtocolRouter {
    pub(super) async fn handle_github(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::ShellServiceGetViewer => {
                github_protocol::get_viewer(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellServiceEnqueuePrRefresh => github_protocol::enqueue_pr_refresh(
                &self.github,
                request.payload,
                &self.connection_id,
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::ShellServiceReportVisiblePrRefreshCandidates => {
                github_protocol::report_visible_pr_refresh_candidates(
                    &self.github,
                    request.payload,
                    &self.connection_id,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellServiceCheckYiruStarred => {
                github_protocol::check_yiru_starred(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellServiceStarYiru => {
                github_protocol::star_yiru(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetRepoSlug => {
                github_service::get_repo_slug(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetRepoUpstream => {
                github_service::get_repo_upstream(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetRateLimit => {
                github_service::get_rate_limit(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceListWorkItems => {
                github_service::list_work_items(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceListLabels => github_service::list_labels(&self.github, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ServiceListAssignableUsers => {
                github_service::list_assignable_users(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetWorkItem => {
                github_service::get_work_item(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetWorkItemByOwnerRepo => {
                github_service::get_work_item_by_owner_repo(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetWorkItemDetails => {
                github_service::get_work_item_details(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetPrForBranch => {
                github_service::get_pr_for_branch(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceRefreshPrForBranch => {
                github_service::refresh_pr_for_branch(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetPrChecks => {
                github_service::get_pr_checks(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetPrCheckDetails => {
                github_service::get_pr_check_details(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceRerunPrChecks => {
                github_service::rerun_pr_checks(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetPrComments => {
                github_service::get_pr_comments(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetPrFileContents => {
                github_service::get_pr_file_contents(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceResolveReviewThread => {
                github_service::resolve_review_thread(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceSetPrFileViewed => {
                github_service::set_pr_file_viewed(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceUpdatePrTitle => {
                github_service::update_pr_title(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceUpdatePr => github_service::update_pr(&self.github, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ServiceUpdatePrState => {
                github_service::update_pr_state(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceMergePr => github_service::merge_pr(&self.github, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ServiceSetPrAutoMerge => {
                github_service::set_pr_auto_merge(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceRequestPrReviewers => {
                github_service::request_pr_reviewers(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceRemovePrReviewers => {
                github_service::remove_pr_reviewers(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceAddPrComment => {
                github_service::add_pr_comment(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceAddPrReviewComment => {
                github_service::add_pr_review_comment(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceAddPrReviewCommentReply => {
                github_service::add_pr_review_comment_reply(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceCreateCommentDraft => {
                github_service::create_comment_draft(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetHostedReviewForBranch => {
                github_service::get_hosted_review_for_branch(
                    &self.github,
                    request.payload,
                    context.peer_kind() != PeerKind::Daemon,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceGetHostedReviewCreationEligibility => {
                github_service::get_hosted_review_creation_eligibility(
                    &self.github,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceCreateHostedReview => {
                github_service::create_hosted_review(&self.github, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ServiceSubscribeEvents => {
                return match github_service::subscribe_events(
                    &self.github,
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}
