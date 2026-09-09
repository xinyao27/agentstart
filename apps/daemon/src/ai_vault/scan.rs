use std::cmp::Reverse;
use std::collections::HashSet;
use std::sync::Arc;

use serde_json::{Map, Value};

use crate::hosts::{ExecutionHost, HostFilesystem};

use super::accumulator;
use super::authority::AiVaultAuthority;
use super::model::{AiVaultAgent, AiVaultListResult, AiVaultScanIssue};
use super::parse_cache::{self, ParseAccounting, ParseKind};
use super::{discovery, projection};

impl AiVaultAuthority {
    pub(super) async fn scan(
        &self,
        scope: &str,
        stamp: Option<&str>,
        limit: usize,
        scope_paths: &[String],
    ) -> AiVaultListResult {
        let mut trace = self.inner.trace.start_span("aiVault.scan", Map::new());
        let (hosts, mut issues) = self.resolve_hosts(scope, stamp).await;
        let mut sessions = Vec::new();
        let mut candidates_count = 0_u64;
        let mut stats = ScanStats::default();
        for (host, execution_host_id) in hosts {
            let filesystem = HostFilesystem::new(host.clone());
            let managed = (host.id() == "local").then_some(self.inner.managed_codex_home.as_str());
            let candidates =
                discovery::discover(host.as_ref(), &filesystem, managed, &mut issues).await;
            candidates_count = candidates_count.saturating_add(candidates.len() as u64);
            for batch in candidates.chunks(8) {
                let parses = batch.iter().map(|candidate| {
                    parse_cache::parse_cached(
                        &self.inner.parse_cache,
                        candidate,
                        &filesystem,
                        host.as_ref(),
                        &execution_host_id,
                    )
                });
                for (candidate, result) in batch
                    .iter()
                    .zip(futures_util::future::join_all(parses).await)
                {
                    match result {
                        Ok(parsed) => {
                            stats.record(parsed.accounting);
                            if let Some(session) = parsed.session {
                                sessions.push(session);
                            }
                        }
                        Err(failure) => {
                            stats.record(failure.accounting);
                            issues.push(AiVaultScanIssue {
                                execution_host_id: Some(execution_host_id.clone()),
                                agent: candidate.agent,
                                path: candidate.path.clone(),
                                message: failure.error.to_string(),
                            });
                        }
                    }
                }
            }
        }
        trace.set_attribute("candidates", Value::from(candidates_count));
        trace.set_attribute("reused", Value::from(stats.reused));
        trace.set_attribute("incremental", Value::from(stats.incremental));
        trace.set_attribute("fullParses", Value::from(stats.full_parses));
        trace.set_attribute("bytesRead", Value::from(stats.bytes_read));
        trace.set_attribute("issues", Value::from(issues.len() as u64));
        trace.success();
        retain_sessions(sessions, issues, limit, scope_paths)
    }

    async fn resolve_hosts(
        &self,
        scope: &str,
        stamp: Option<&str>,
    ) -> (Vec<(Arc<dyn ExecutionHost>, String)>, Vec<AiVaultScanIssue>) {
        let mut hosts = Vec::new();
        let mut issues = Vec::new();
        if scope == "all" {
            match self.inner.hosts.list().await {
                Ok(list) => {
                    for descriptor in list.hosts {
                        match self.inner.hosts.execution_host(&descriptor.id).await {
                            Ok(host) => hosts.push((host, descriptor.id)),
                            Err(error) => {
                                issues.push(host_issue(&descriptor.id, error.to_string()))
                            }
                        }
                    }
                }
                Err(error) => issues.push(AiVaultScanIssue {
                    execution_host_id: None,
                    agent: AiVaultAgent::Codex,
                    path: "execution hosts".to_owned(),
                    message: error.to_string(),
                }),
            }
        } else {
            let host_id = if scope.starts_with("runtime:") {
                "local"
            } else {
                scope
            };
            match self.inner.hosts.execution_host(host_id).await {
                Ok(host) => hosts.push((host, stamp.unwrap_or(scope).to_owned())),
                Err(error) => issues.push(host_issue(scope, error.to_string())),
            }
        }
        (hosts, issues)
    }
}

#[derive(Default)]
struct ScanStats {
    bytes_read: u64,
    full_parses: u64,
    incremental: u64,
    reused: u64,
}

impl ScanStats {
    fn record(&mut self, accounting: ParseAccounting) {
        self.bytes_read = self.bytes_read.saturating_add(accounting.bytes_read);
        let counter = match accounting.kind {
            ParseKind::Full => &mut self.full_parses,
            ParseKind::Incremental => &mut self.incremental,
            ParseKind::Reused => &mut self.reused,
        };
        *counter = counter.saturating_add(1);
    }
}

fn retain_sessions(
    sessions: Vec<super::model::AiVaultSession>,
    issues: Vec<AiVaultScanIssue>,
    limit: usize,
    scope_paths: &[String],
) -> AiVaultListResult {
    let mut sessions = projection::dedupe(sessions);
    sessions.sort_by_key(|session| Reverse(accumulator::sort_time(session)));
    let mut retained = sessions.iter().take(limit).cloned().collect::<Vec<_>>();
    if !scope_paths.is_empty() {
        let ids = retained
            .iter()
            .map(|session| session.id.clone())
            .collect::<HashSet<_>>();
        retained.extend(
            sessions
                .into_iter()
                .filter(|session| {
                    !ids.contains(&session.id)
                        && session.cwd.as_deref().is_some_and(|cwd| {
                            scope_paths
                                .iter()
                                .any(|scope| projection::path_inside(scope, cwd))
                        })
                })
                .take(2_000),
        );
        retained.sort_by(|left, right| {
            accumulator::sort_time(right).cmp(&accumulator::sort_time(left))
        });
    }
    AiVaultListResult {
        sessions: retained,
        issues,
        scanned_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    }
}

fn host_issue(host_id: &str, message: String) -> AiVaultScanIssue {
    AiVaultScanIssue {
        execution_host_id: Some(host_id.to_owned()),
        agent: AiVaultAgent::Codex,
        path: host_id.to_owned(),
        message,
    }
}
