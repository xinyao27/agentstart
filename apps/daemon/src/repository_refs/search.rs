use std::cmp::Reverse;
use std::collections::HashSet;
use std::sync::Arc;

use crate::hosts::ExecutionHost;

use super::{RefDetail, RepositoryRefsError, git_stdout};

const CANDIDATE_MULTIPLIER: usize = 4;
const LEGACY_HEADROOM: usize = 100;

enum PatternGroup {
    BranchRoot,
    Segmented,
}

pub(super) fn validate_limit(limit: f64) -> Result<usize, RepositoryRefsError> {
    if !limit.is_finite() || limit.fract() != 0.0 || limit <= 0.0 {
        return Err(RepositoryRefsError::InvalidLimit);
    }
    Ok(limit as usize)
}

pub(super) async fn search(
    host: Arc<dyn ExecutionHost>,
    cwd: &str,
    query: &str,
    limit: usize,
) -> Vec<RefDetail> {
    let normalized_query = normalize_query(query);
    let remotes = list_remotes(host.clone(), cwd).await;
    let tokens = tokens(&normalized_query);
    if tokens.len() > 1 {
        let (segmented, branch_root) = tokio::join!(
            run_search(
                host.clone(),
                cwd,
                &normalized_query,
                limit,
                &remotes,
                Some(PatternGroup::Segmented),
            ),
            run_search(
                host,
                cwd,
                &normalized_query,
                limit,
                &remotes,
                Some(PatternGroup::BranchRoot),
            ),
        );
        let (Some(segmented), Some(branch_root)) = (segmented, branch_root) else {
            return Vec::new();
        };
        return merge_groups(
            [
                parse_details(&segmented, limit, &remotes),
                parse_details(&branch_root, limit, &remotes),
            ],
            limit,
        );
    }
    let Some(output) = run_search(host, cwd, &normalized_query, limit, &remotes, None).await else {
        return Vec::new();
    };
    parse_details(&output, limit, &remotes)
}

async fn list_remotes(host: Arc<dyn ExecutionHost>, cwd: &str) -> Vec<String> {
    git_stdout(host, cwd, ["remote"])
        .await
        .map(|output| {
            output
                .split('\n')
                .map(|remote| remote.trim_matches(is_ecmascript_whitespace))
                .filter(|remote| !remote.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

async fn run_search(
    host: Arc<dyn ExecutionHost>,
    cwd: &str,
    query: &str,
    limit: usize,
    remotes: &[String],
    group: Option<PatternGroup>,
) -> Option<String> {
    git_stdout(host, cwd, search_args(query, limit, remotes, group)).await
}

fn search_args(
    query: &str,
    limit: usize,
    remotes: &[String],
    group: Option<PatternGroup>,
) -> Vec<String> {
    let count = limit
        .saturating_mul(CANDIDATE_MULTIPLIER)
        .saturating_add(LEGACY_HEADROOM);
    let mut args = vec![
        "for-each-ref".to_owned(),
        "--format=%(refname)%00%(refname:short)".to_owned(),
        "--sort=-committerdate".to_owned(),
        format!("--count={count}"),
    ];
    let tokens = tokens(query);
    if tokens.len() <= 1 {
        let query = tokens.first().copied().unwrap_or("");
        args.extend([
            format!("refs/heads/**/*{query}*"),
            format!("refs/heads/**/*{query}*/**"),
            format!("refs/remotes/**/*{query}*"),
            format!("refs/remotes/**/*{query}*/**"),
        ]);
        return args;
    }
    let segmented = tokens
        .iter()
        .map(|token| format!("*{token}*"))
        .collect::<Vec<_>>()
        .join("/");
    let substring_query = tokens.join("/");
    let segmented_patterns = [
        format!("refs/remotes/{segmented}"),
        format!("refs/heads/{segmented}"),
    ];
    let mut branch_root_patterns = vec![
        format!("refs/heads/{substring_query}*"),
        format!("refs/heads/{substring_query}*/**"),
    ];
    if remotes.is_empty() {
        branch_root_patterns.extend([
            format!("refs/remotes/*/{substring_query}*"),
            format!("refs/remotes/*/{substring_query}*/**"),
        ]);
    } else {
        for remote in remotes {
            branch_root_patterns.extend([
                format!("refs/remotes/{remote}/{substring_query}*"),
                format!("refs/remotes/{remote}/{substring_query}*/**"),
            ]);
        }
    }
    match group {
        Some(PatternGroup::Segmented) => args.extend(segmented_patterns),
        Some(PatternGroup::BranchRoot) => args.extend(branch_root_patterns),
        None => {
            args.extend(segmented_patterns);
            args.extend(branch_root_patterns);
        }
    }
    args
}

fn normalize_query(query: &str) -> String {
    query
        .trim_matches(is_ecmascript_whitespace)
        .chars()
        .filter(|character| !matches!(character, '*' | '?' | '[' | ']' | '\\'))
        .collect()
}

fn tokens(query: &str) -> Vec<&str> {
    query.split('/').filter(|token| !token.is_empty()).collect()
}

fn parse_details(output: &str, limit: usize, remotes: &[String]) -> Vec<RefDetail> {
    let mut remotes = remotes.to_vec();
    remotes.sort_by_key(|remote| Reverse(remote.len()));
    let mut seen = HashSet::new();
    output
        .split('\n')
        .map(|line| line.trim_matches(is_ecmascript_whitespace))
        .filter(|line| !line.is_empty())
        .filter_map(|line| line.split_once('\0'))
        .filter(|(full, _)| !is_remote_head(full))
        .filter(|(_, short)| seen.insert((*short).to_owned()))
        .map(|(full, short)| RefDetail {
            local_branch_name: local_branch_name(full, short, &remotes),
            ref_name: short.to_owned(),
        })
        .take(limit)
        .collect()
}

fn is_remote_head(full: &str) -> bool {
    full.strip_prefix("refs/remotes/")
        .and_then(|reference| reference.strip_suffix("/HEAD"))
        .is_some_and(|remote| !remote.is_empty())
}

fn local_branch_name(full: &str, short: &str, remotes: &[String]) -> String {
    let Some(remote_and_branch) = full.strip_prefix("refs/remotes/") else {
        return short.to_owned();
    };
    if let Some(branch) = remotes.iter().find_map(|remote| {
        remote_and_branch
            .strip_prefix(remote)
            .and_then(|suffix| suffix.strip_prefix('/'))
    }) {
        return branch.to_owned();
    }
    let fallback = remote_and_branch
        .split('/')
        .skip(1)
        .collect::<Vec<_>>()
        .join("/");
    if fallback.is_empty() {
        short.to_owned()
    } else {
        fallback
    }
}

fn merge_groups<const N: usize>(groups: [Vec<RefDetail>; N], limit: usize) -> Vec<RefDetail> {
    let max_length = groups.iter().map(Vec::len).max().unwrap_or(0);
    let mut seen = HashSet::new();
    let mut merged = Vec::new();
    for index in 0..max_length {
        for group in &groups {
            let Some(detail) = group.get(index) else {
                continue;
            };
            if !seen.insert(detail.ref_name.clone()) {
                continue;
            }
            merged.push(RefDetail {
                local_branch_name: detail.local_branch_name.clone(),
                ref_name: detail.ref_name.clone(),
            });
            if merged.len() >= limit {
                return merged;
            }
        }
    }
    merged
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
