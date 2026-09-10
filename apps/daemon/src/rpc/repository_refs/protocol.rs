use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    RepoRefDetail, RepoRefDetailList, RepoServiceBaseRefDefaultRequest,
    RepoServiceBaseRefDefaultResponse, RepoServiceSearchRefsRequest, RepoServiceSearchRefsResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::repository_refs::RepositoryRefs;

const DEFAULT_SEARCH_LIMIT: f64 = 25.0;

pub(in crate::rpc) async fn base_ref_default(
    refs: &RepositoryRefs,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceBaseRefDefaultRequest>(payload)?;
    let repo = required_selector(&request.repo, "Repository selector must not be empty")?;
    validate_host_id(request.host_id.as_deref())?;
    let result = refs
        .default_base_ref(&repo, request.host_id.as_deref())
        .await
        .map_err(refs_status)?;
    Ok(encode(&RepoServiceBaseRefDefaultResponse {
        default_base_ref: result.default_base_ref,
        remote_count: remote_count(result.remote_count)?,
    }))
}

pub(in crate::rpc) async fn search_refs(
    refs: &RepositoryRefs,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceSearchRefsRequest>(payload)?;
    let repo = required_selector(&request.repo, "Repository selector must not be empty")?;
    let query = required_selector(&request.query, "Search query must not be empty")?;
    validate_host_id(request.host_id.as_deref())?;
    let result = refs
        .search(
            &repo,
            &query,
            request.limit.unwrap_or(DEFAULT_SEARCH_LIMIT),
            request.host_id.as_deref(),
        )
        .await
        .map_err(refs_status)?;
    Ok(encode(&RepoServiceSearchRefsResponse {
        refs: result.refs,
        truncated: result.truncated,
        ref_details: result.ref_details.map(|details| RepoRefDetailList {
            values: details
                .into_iter()
                .map(|detail| RepoRefDetail {
                    local_branch_name: detail.local_branch_name,
                    ref_name: detail.ref_name,
                })
                .collect(),
        }),
    }))
}

fn required_selector(value: &str, message: &str) -> Result<String, Status> {
    if value.is_empty() {
        return Err(invalid_argument(message));
    }
    Ok(value.to_owned())
}

fn validate_host_id(host_id: Option<&str>) -> Result<(), Status> {
    match host_id {
        Some(host_id) if !is_execution_host_id(host_id) => Err(invalid_argument(
            "Host identifier is not a valid execution host",
        )),
        _ => Ok(()),
    }
}

fn is_execution_host_id(host_id: &str) -> bool {
    let normalized = host_id.trim_matches(is_ecmascript_whitespace);
    if normalized == "local" {
        return true;
    }
    ["runtime:", "ssh:", "wsl:"].into_iter().any(|prefix| {
        normalized
            .strip_prefix(prefix)
            .is_some_and(|encoded| !encoded.is_empty() && decode_uri_component(encoded).is_some())
    })
}

fn decode_uri_component(encoded: &str) -> Option<String> {
    let bytes = encoded.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'%' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }
        let high = hex(bytes.get(index + 1).copied()?)?;
        let low = hex(bytes.get(index + 2).copied()?)?;
        decoded.push(high * 16 + low);
        index += 3;
    }
    String::from_utf8(decoded)
        .ok()
        .filter(|value| !value.is_empty())
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'
            ..='\u{000d}'
                | '\u{0020}'
                | '\u{00a0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

fn remote_count(count: usize) -> Result<u32, Status> {
    u32::try_from(count)
        .map_err(|_| data_loss("Repository remote count exceeds the wire representation"))
}

// Why: every authority failure degrades the same way on the legacy JSON
// surface — a generic internal error with no detail — so the protobuf surface
// collapses the variants identically instead of inventing finer statuses.
fn refs_status(_error: crate::repository_refs::RepositoryRefsError) -> Status {
    status(StatusCode::Internal, "Repository refs lookup failed")
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
