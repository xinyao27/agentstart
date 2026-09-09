// Why: the 33 `github`/`githubCommentDraft`/`hostedReview` legacy methods share one
// `GitHubAuthority`-backed protobuf service; each file groups the resource area (work items,
// checks, comments, mutations, hosted review, rate limit, events) the way the authority itself
// is split under `crate::github`.
mod checks;
mod comments;
mod events;
mod hosted_review;
mod mapping;
mod mutations;
mod rate_limit;
mod work_item_details;
mod work_items;

pub(in crate::rpc) use checks::{get_pr_check_details, get_pr_checks, rerun_pr_checks};
pub(in crate::rpc) use comments::{
    add_pr_comment, add_pr_review_comment, add_pr_review_comment_reply, get_pr_comments,
    get_pr_file_contents, resolve_review_thread, set_pr_file_viewed,
};
pub(in crate::rpc) use events::subscribe_events;
pub(in crate::rpc) use hosted_review::{
    create_comment_draft, create_hosted_review, get_hosted_review_creation_eligibility,
    get_hosted_review_for_branch,
};
pub(in crate::rpc) use mutations::{
    merge_pr, remove_pr_reviewers, request_pr_reviewers, set_pr_auto_merge, update_pr,
    update_pr_state, update_pr_title,
};
pub(in crate::rpc) use rate_limit::get_rate_limit;
pub(in crate::rpc) use work_item_details::get_work_item_details;
pub(in crate::rpc) use work_items::{
    get_pr_for_branch, get_repo_slug, get_repo_upstream, get_work_item,
    get_work_item_by_owner_repo, list_assignable_users, list_labels, list_work_items,
    refresh_pr_for_branch,
};
