use super::{
    ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest, ProtocolRouter,
    git_branch_protocol, git_generation_protocol, git_history_protocol, git_remote_protocol,
    git_rewrite_protocol, git_staging_protocol, git_status_protocol,
};

pub(super) enum Method {
    StatusServiceStatus,
    StatusServiceDiff,
    StatusServiceSubmoduleStatus,
    StatusServiceCheckIgnored,
    StatusServiceFindHugeFoldersToIgnore,
    StatusServiceLocalBranches,
    StatusServiceUpstreamStatus,
    StatusServiceRemoteCommitUrl,
    StagingServiceStage,
    StagingServiceUnstage,
    StagingServiceDiscard,
    StagingServiceBulkStage,
    StagingServiceBulkUnstage,
    StagingServiceBulkDiscard,
    StagingServiceCommit,
    StagingServiceAppendGitignore,
    BranchServiceCheckout,
    BranchServiceCheckoutCommit,
    BranchServiceCreateBranch,
    BranchServiceAddTag,
    HistoryRewriteServiceConflictOperation,
    HistoryRewriteServiceAbortMerge,
    HistoryRewriteServiceAbortRebase,
    HistoryRewriteServiceAbortRevert,
    HistoryRewriteServiceCherryPick,
    HistoryRewriteServiceRevertCommit,
    HistoryRewriteServiceDropCommit,
    HistoryRewriteServiceResetToCommit,
    HistoryRewriteServiceRebaseFromBase,
    HistoryRewriteServiceRebaseOntoCommit,
    HistoryRewriteServiceMergeCommit,
    HistoryServiceHistory,
    HistoryServiceBranchCompare,
    HistoryServiceBranchDiff,
    HistoryServiceCommitCompare,
    HistoryServiceCommitDiff,
    RemoteServiceFetch,
    RemoteServicePull,
    RemoteServiceFastForward,
    RemoteServicePush,
    RemoteServiceForkSync,
    GenerationServiceGenerateCommitMessage,
    GenerationServiceCancelGenerateCommitMessage,
    GenerationServiceGeneratePullRequestFields,
    GenerationServiceCancelGeneratePullRequestFields,
}

impl ProtocolRouter {
    pub(super) async fn handle_git(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::StatusServiceStatus => git_status_protocol::status(&self.git, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::StatusServiceDiff => git_status_protocol::diff(&self.git, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::StatusServiceSubmoduleStatus => {
                git_status_protocol::submodule_status(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StatusServiceCheckIgnored => {
                git_status_protocol::check_ignored(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StatusServiceFindHugeFoldersToIgnore => {
                git_status_protocol::find_huge_folders_to_ignore(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StatusServiceLocalBranches => {
                git_status_protocol::local_branches(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StatusServiceUpstreamStatus => {
                git_status_protocol::upstream_status_call(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StatusServiceRemoteCommitUrl => {
                git_status_protocol::remote_commit_url(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StagingServiceStage => git_staging_protocol::stage(&self.git, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::StagingServiceUnstage => {
                git_staging_protocol::unstage(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StagingServiceDiscard => {
                git_staging_protocol::discard(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StagingServiceBulkStage => {
                git_staging_protocol::bulk_stage(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StagingServiceBulkUnstage => {
                git_staging_protocol::bulk_unstage(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StagingServiceBulkDiscard => {
                git_staging_protocol::bulk_discard(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StagingServiceCommit => {
                git_staging_protocol::commit(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StagingServiceAppendGitignore => {
                git_staging_protocol::append_gitignore(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BranchServiceCheckout => {
                git_branch_protocol::checkout(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BranchServiceCheckoutCommit => {
                git_branch_protocol::checkout_commit(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BranchServiceCreateBranch => {
                git_branch_protocol::create_branch(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BranchServiceAddTag => git_branch_protocol::add_tag(&self.git, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HistoryRewriteServiceConflictOperation => {
                git_rewrite_protocol::conflict_operation_call(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceAbortMerge => {
                git_rewrite_protocol::abort_merge(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceAbortRebase => {
                git_rewrite_protocol::abort_rebase(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceAbortRevert => {
                git_rewrite_protocol::abort_revert(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceCherryPick => {
                git_rewrite_protocol::cherry_pick(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceRevertCommit => {
                git_rewrite_protocol::revert_commit(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceDropCommit => {
                git_rewrite_protocol::drop_commit(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceResetToCommit => {
                git_rewrite_protocol::reset_to_commit(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceRebaseFromBase => {
                git_rewrite_protocol::rebase_from_base(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceRebaseOntoCommit => {
                git_rewrite_protocol::rebase_onto_commit(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryRewriteServiceMergeCommit => {
                git_rewrite_protocol::merge_commit(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryServiceHistory => {
                git_history_protocol::history(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryServiceBranchCompare => {
                git_history_protocol::branch_compare(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryServiceBranchDiff => {
                git_history_protocol::branch_diff(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryServiceCommitCompare => {
                git_history_protocol::commit_compare(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::HistoryServiceCommitDiff => {
                git_history_protocol::commit_diff(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RemoteServiceFetch => git_remote_protocol::fetch(&self.git, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RemoteServicePull => git_remote_protocol::pull(&self.git, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RemoteServiceFastForward => {
                git_remote_protocol::fast_forward(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RemoteServicePush => git_remote_protocol::push(&self.git, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RemoteServiceForkSync => {
                git_remote_protocol::fork_sync(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::GenerationServiceGenerateCommitMessage => {
                git_generation_protocol::generate_commit_message(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::GenerationServiceCancelGenerateCommitMessage => {
                git_generation_protocol::cancel_generate_commit_message(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::GenerationServiceGeneratePullRequestFields => {
                git_generation_protocol::generate_pull_request_fields(&self.git, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::GenerationServiceCancelGeneratePullRequestFields => {
                git_generation_protocol::cancel_generate_pull_request_fields(
                    &self.git,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}
