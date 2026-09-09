use std::path::PathBuf;
use std::sync::Arc;

use crate::diagnostics::DiagnosticsTrace;
use crate::host_registry::HostRegistry;
use crate::hosts::HostFilesystem;

use super::list_cache::SessionListCache;
use super::model::{
    AiVaultAgent, AiVaultListInput, AiVaultListResult, AiVaultScanIssue, AiVaultSubagentListResult,
};
use super::parse_cache::SessionParseCache;
use super::{projection, subagents};

#[derive(Clone)]
pub(crate) struct AiVaultAuthority {
    pub(super) inner: Arc<AuthorityInner>,
}

pub(super) struct AuthorityInner {
    pub(super) cache: SessionListCache,
    pub(super) hosts: HostRegistry,
    pub(super) managed_codex_home: String,
    pub(super) parse_cache: SessionParseCache,
    pub(super) scan_lock: tokio::sync::Mutex<()>,
    pub(super) trace: DiagnosticsTrace,
}

impl AiVaultAuthority {
    pub(crate) fn new(
        hosts: HostRegistry,
        user_data_path: PathBuf,
        trace: DiagnosticsTrace,
    ) -> Self {
        Self {
            inner: Arc::new(AuthorityInner {
                cache: SessionListCache::new(),
                hosts,
                managed_codex_home: user_data_path
                    .join("codex-runtime-home")
                    .join("home")
                    .to_string_lossy()
                    .into_owned(),
                parse_cache: SessionParseCache::new(),
                scan_lock: tokio::sync::Mutex::new(()),
                trace,
            }),
        }
    }

    pub(crate) async fn list(&self, input: AiVaultListInput) -> AiVaultListResult {
        let scope = projection::normalize_scope(input.execution_host_scope.as_deref());
        let stamp = if input.execution_host_scope.is_none() {
            input.execution_host_id.as_deref()
        } else {
            None
        };
        let key = projection::cache_key(&scope, stamp, input.limit, &input.scope_paths);
        if !input.force
            && let Some(result) = self.inner.cache.get(&key)
        {
            return projection::requested(result, input.compact);
        }
        let _scan = self.inner.scan_lock.lock().await;
        if !input.force
            && let Some(result) = self.inner.cache.get(&key)
        {
            return projection::requested(result, input.compact);
        }
        let result = self
            .scan(&scope, stamp, input.limit, &input.scope_paths)
            .await;
        self.inner.cache.store(key, result.clone());
        projection::requested(result, input.compact)
    }

    pub(crate) async fn list_subagents(
        &self,
        agent: Option<AiVaultAgent>,
        parent_path: Option<String>,
        execution_host_id: Option<String>,
    ) -> AiVaultSubagentListResult {
        if agent != Some(AiVaultAgent::Claude)
            || execution_host_id
                .as_deref()
                .is_some_and(|value| value != "local")
        {
            return empty_subagents();
        }
        let Some(parent_path) = parent_path.filter(|value| !value.trim().is_empty()) else {
            return empty_subagents();
        };
        let Ok(host) = self.inner.hosts.execution_host("local").await else {
            return AiVaultSubagentListResult {
                sessions: Vec::new(),
                issues: vec![AiVaultScanIssue {
                    execution_host_id: Some("local".to_owned()),
                    agent: AiVaultAgent::Claude,
                    path: parent_path,
                    message: "AI Vault could not access the local execution host".to_owned(),
                }],
            };
        };
        let filesystem = HostFilesystem::new(host.clone());
        let roots = subagents::local_claude_roots(&filesystem).await;
        let (sessions, issues) =
            subagents::list(&parent_path, host.as_ref(), &filesystem, &roots).await;
        AiVaultSubagentListResult { sessions, issues }
    }
}

fn empty_subagents() -> AiVaultSubagentListResult {
    AiVaultSubagentListResult {
        sessions: Vec::new(),
        issues: Vec::new(),
    }
}
