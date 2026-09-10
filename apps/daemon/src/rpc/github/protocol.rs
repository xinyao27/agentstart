use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    AppStarSource as ProtocolStarSource, GitHubPrChecksStatus, GitHubPrMergeable,
    GitHubPrRefreshCandidate as ProtocolCandidate,
    GitHubPrRefreshEnqueueKind as ProtocolEnqueueKind, GitHubPrRefreshFallbackSource,
    GitHubPrRefreshReason as ProtocolReason,
    GitHubPrRefreshValidationSkip as ProtocolValidationSkip, GitHubPrState,
    GitHubShellServiceCheckAgentStartStarredRequest,
    GitHubShellServiceCheckAgentStartStarredResponse, GitHubShellServiceEnqueuePrRefreshRequest,
    GitHubShellServiceEnqueuePrRefreshResponse, GitHubShellServiceGetViewerRequest,
    GitHubShellServiceGetViewerResponse, GitHubShellServiceReportVisiblePrRefreshCandidatesRequest,
    GitHubShellServiceReportVisiblePrRefreshCandidatesResponse,
    GitHubShellServiceStarAgentStartRequest, GitHubShellServiceStarAgentStartResponse,
    GitHubViewer, ProjectRepositoryKind,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value};

use crate::github::{
    AppStarSource, PrRefreshCandidate, PrRefreshEnqueueResult, PrRefreshReason, ValidationSkip,
};
use crate::projects::ProjectKind;

use super::GitHubRpc;

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

pub(in crate::rpc) async fn get_viewer(rpc: &GitHubRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<GitHubShellServiceGetViewerRequest>(payload)?;
    Ok(encode(&GitHubShellServiceGetViewerResponse {
        viewer: rpc
            .authority
            .viewer()
            .await
            .map(|(login, email)| GitHubViewer { login, email }),
    }))
}

pub(in crate::rpc) async fn enqueue_pr_refresh(
    rpc: &GitHubRpc,
    payload: &[u8],
    connection_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubShellServiceEnqueuePrRefreshRequest>(payload)?;
    let candidate = candidate(required(
        request.candidate,
        "PR refresh candidate is missing",
    )?)?;
    let result = rpc
        .authority
        .enqueue_pr_refresh(
            candidate,
            reason(request.reason)?,
            request.priority.unwrap_or_default(),
            connection_id.to_owned(),
        )
        .await;
    let (kind, skipped_reason) = match result {
        PrRefreshEnqueueResult::Queued => (ProtocolEnqueueKind::Queued, None),
        PrRefreshEnqueueResult::Skipped(skip) => (
            ProtocolEnqueueKind::Skipped,
            Some(match skip {
                ValidationSkip::Denied => ProtocolValidationSkip::Denied as i32,
                ValidationSkip::Backoff => ProtocolValidationSkip::Backoff as i32,
            }),
        ),
    };
    Ok(encode(&GitHubShellServiceEnqueuePrRefreshResponse {
        kind: kind as i32,
        skipped_reason,
    }))
}

pub(in crate::rpc) async fn report_visible_pr_refresh_candidates(
    rpc: &GitHubRpc,
    payload: &[u8],
    connection_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubShellServiceReportVisiblePrRefreshCandidatesRequest>(payload)?;
    if !is_nonnegative_safe_integer(request.generation) {
        return Err(invalid(
            "PR refresh generation must be a nonnegative safe integer",
        ));
    }
    let candidates = request
        .candidates
        .into_iter()
        .map(candidate)
        .collect::<Result<Vec<_>, _>>()?;
    let accepted = rpc
        .authority
        .report_visible_pr_refresh_candidates(
            candidates,
            request.generation,
            connection_id.to_owned(),
        )
        .await;
    Ok(encode(
        &GitHubShellServiceReportVisiblePrRefreshCandidatesResponse { accepted },
    ))
}

pub(in crate::rpc) async fn check_agentstart_starred(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<GitHubShellServiceCheckAgentStartStarredRequest>(payload)?;
    Ok(encode(&GitHubShellServiceCheckAgentStartStarredResponse {
        starred: rpc.authority.check_agentstart_starred().await,
    }))
}

pub(in crate::rpc) async fn star_agentstart(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubShellServiceStarAgentStartRequest>(payload)?;
    let source = star_source(request.source)?;
    let starred = rpc.authority.star_agentstart().await;
    if starred {
        rpc.telemetry
            .track_main(
                "app_starred_agentstart",
                Map::from_iter([("source".to_owned(), Value::from(source.as_str()))]),
            )
            .await;
    }
    Ok(encode(&GitHubShellServiceStarAgentStartResponse {
        starred,
    }))
}

fn candidate(candidate: ProtocolCandidate) -> Result<PrRefreshCandidate, Status> {
    let cached_fetched_at_ms = candidate
        .cached_fetched_at_ms
        .map(|value| {
            if !is_nonnegative_safe_integer(value) {
                Err(invalid(
                    "Cached PR refresh timestamp must be a nonnegative safe integer",
                ))
            } else {
                Ok(value as u64)
            }
        })
        .transpose()?;
    Ok(PrRefreshCandidate {
        cache_key: candidate.cache_key,
        repo_id: candidate.repo_id,
        repo_path: candidate.repo_path,
        repo_kind: match enumeration::<ProjectRepositoryKind>(candidate.repo_kind, "repo kind")? {
            ProjectRepositoryKind::Git => ProjectKind::Git,
            ProjectRepositoryKind::Folder => ProjectKind::Folder,
            ProjectRepositoryKind::Unspecified => {
                return Err(invalid("PR refresh repo kind is unspecified"));
            }
        },
        branch: candidate.branch,
        worktree_id: candidate.worktree_id,
        current_head_oid: candidate.current_head_oid,
        linked_pr_number: candidate.linked_pr_number,
        fallback_pr_number: candidate.fallback_pr_number,
        fallback_pr_source: candidate
            .fallback_pr_source
            .map(fallback_source)
            .transpose()?,
        is_bare: candidate.is_bare,
        is_archived: candidate.is_archived,
        cached_fetched_at_ms,
        cached_has_pr: candidate.cached_has_pr,
        cached_pr_state: candidate.cached_pr_state.map(pr_state).transpose()?,
        cached_checks_status: candidate
            .cached_checks_status
            .map(checks_status)
            .transpose()?,
        cached_mergeable: candidate.cached_mergeable.map(mergeable).transpose()?,
        cached_merge_state_status: candidate.cached_merge_state_status,
        execution_host_id: String::new(),
    })
}

fn reason(value: i32) -> Result<PrRefreshReason, Status> {
    Ok(
        match enumeration::<ProtocolReason>(value, "refresh reason")? {
            ProtocolReason::Visible => PrRefreshReason::Visible,
            ProtocolReason::Active => PrRefreshReason::Active,
            ProtocolReason::PostPush => PrRefreshReason::PostPush,
            ProtocolReason::Manual => PrRefreshReason::Manual,
            ProtocolReason::Swr => PrRefreshReason::Swr,
            ProtocolReason::Unspecified => return Err(invalid("PR refresh reason is unspecified")),
        },
    )
}

fn star_source(value: i32) -> Result<AppStarSource, Status> {
    Ok(
        match enumeration::<ProtocolStarSource>(value, "star source")? {
            ProtocolStarSource::StarNag => AppStarSource::StarNag,
            ProtocolStarSource::AgentValueMoment => AppStarSource::AgentValueMoment,
            ProtocolStarSource::OnboardingCompleted => AppStarSource::OnboardingCompleted,
            ProtocolStarSource::Settings => AppStarSource::Settings,
            ProtocolStarSource::Landing => AppStarSource::Landing,
            ProtocolStarSource::Unspecified => {
                return Err(invalid("AgentStart star source is unspecified"));
            }
        },
    )
}

fn fallback_source(value: i32) -> Result<&'static str, Status> {
    Ok(
        match enumeration::<GitHubPrRefreshFallbackSource>(value, "fallback source")? {
            GitHubPrRefreshFallbackSource::Explicit => "explicit",
            GitHubPrRefreshFallbackSource::PrCache => "pr-cache",
            GitHubPrRefreshFallbackSource::HostedReview => "hosted-review",
            GitHubPrRefreshFallbackSource::Unspecified => {
                return Err(invalid("PR refresh fallback source is unspecified"));
            }
        },
    )
}

fn pr_state(value: i32) -> Result<&'static str, Status> {
    Ok(match enumeration::<GitHubPrState>(value, "PR state")? {
        GitHubPrState::Open => "open",
        GitHubPrState::Closed => "closed",
        GitHubPrState::Merged => "merged",
        GitHubPrState::Draft => "draft",
        GitHubPrState::Unspecified => return Err(invalid("Cached PR state is unspecified")),
    })
}

fn checks_status(value: i32) -> Result<&'static str, Status> {
    Ok(
        match enumeration::<GitHubPrChecksStatus>(value, "checks status")? {
            GitHubPrChecksStatus::Pending => "pending",
            GitHubPrChecksStatus::Success => "success",
            GitHubPrChecksStatus::Failure => "failure",
            GitHubPrChecksStatus::Neutral => "neutral",
            GitHubPrChecksStatus::Unspecified => {
                return Err(invalid("Cached checks status is unspecified"));
            }
        },
    )
}

fn mergeable(value: i32) -> Result<&'static str, Status> {
    Ok(
        match enumeration::<GitHubPrMergeable>(value, "mergeable")? {
            GitHubPrMergeable::Mergeable => "MERGEABLE",
            GitHubPrMergeable::Conflicting => "CONFLICTING",
            GitHubPrMergeable::Unknown => "UNKNOWN",
            GitHubPrMergeable::Unspecified => {
                return Err(invalid("Cached mergeable state is unspecified"));
            }
        },
    )
}

fn enumeration<T>(value: i32, field: &str) -> Result<T, Status>
where
    T: TryFrom<i32>,
{
    T::try_from(value).map_err(|_| invalid(&format!("GitHub {field} is unknown")))
}

fn required<T>(value: Option<T>, message: &str) -> Result<T, Status> {
    value.ok_or_else(|| invalid(message))
}

fn is_nonnegative_safe_integer(value: f64) -> bool {
    value.is_finite() && (0.0..=MAX_SAFE_INTEGER).contains(&value) && value.fract() == 0.0
}

fn invalid(message: &str) -> Status {
    Status {
        code: StatusCode::InvalidArgument as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
