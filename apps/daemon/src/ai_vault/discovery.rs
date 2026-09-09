mod opencode;
mod roots;
mod walk;

use std::collections::HashMap;

use crate::hosts::{ExecutionHost, HostFilesystem};

use super::model::{AiVaultAgent, AiVaultScanIssue, SessionCandidate};

const LIMIT_PER_AGENT: usize = 1_000;

pub(super) async fn discover(
    host: &dyn ExecutionHost,
    filesystem: &HostFilesystem,
    managed_codex_home: Option<&str>,
    issues: &mut Vec<AiVaultScanIssue>,
) -> Vec<SessionCandidate> {
    let Some(home) = filesystem.home_directory().await.ok().flatten() else {
        issues.push(issue(
            host.id(),
            AiVaultAgent::Codex,
            "home",
            "AI Vault could not resolve the execution host home directory",
        ));
        return Vec::new();
    };
    let roots = roots::roots(host.kind(), filesystem, &home, managed_codex_home);
    let mut candidates = Vec::new();
    let mut budget = walk::DiscoveryBudget::default();
    for root in roots {
        match walk::discover_files(filesystem, &root, &mut budget).await {
            Ok(mut discovered) => candidates.append(&mut discovered),
            Err(message) => issues.push(issue(host.id(), root.agent, &root.path, &message)),
        }
    }
    opencode::discover_databases(host, filesystem, &home, &mut candidates, issues).await;
    candidates.sort_by(|left, right| {
        right
            .modified_at_ms
            .cmp(&left.modified_at_ms)
            .then_with(|| left.path.cmp(&right.path))
    });
    let mut counts = HashMap::<AiVaultAgent, usize>::new();
    candidates.retain(|candidate| {
        let count = counts.entry(candidate.agent).or_default();
        let keep = *count < LIMIT_PER_AGENT;
        *count = count.saturating_add(1);
        keep
    });
    candidates
}

fn issue(host_id: &str, agent: AiVaultAgent, path: &str, message: &str) -> AiVaultScanIssue {
    AiVaultScanIssue {
        execution_host_id: Some(host_id.to_owned()),
        agent,
        path: path.to_owned(),
        message: message.to_owned(),
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
