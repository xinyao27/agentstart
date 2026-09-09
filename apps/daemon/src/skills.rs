#[path = "skills/claude_plugins.rs"]
mod claude_plugins;
#[path = "skills/directory_access.rs"]
mod directory_access;
#[path = "skills/discovery.rs"]
mod discovery;
#[path = "skills/freshness.rs"]
mod freshness;
#[path = "skills/guides.rs"]
mod guides;
#[path = "skills/lockfile.rs"]
mod lockfile;
#[path = "skills/run.rs"]
mod run;
#[path = "skills/run_output.rs"]
mod run_output;

use std::collections::BTreeSet;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{Value, json};
use tokio::sync::{Mutex, broadcast, watch};

use crate::host_registry::HostRegistry;
use crate::hosts::{HostFilesystem, HostKind};
use crate::repositories::RepositoryAuthority;

use discovery::SourceRoot;

pub(crate) use guides::{BundledSkillGuide, load as load_bundled_guides};

/// Why: the legacy `skills.manage` JSON surface and the protobuf
/// `SkillsService` start verbs must not drift, so both build this typed start
/// and hand it to [`SkillsAuthority::start_run`]; the run body itself still
/// consumes the scope as its persisted JSON shape for the CLI arguments.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SkillRunOperation {
    Update,
    Install,
    Remove,
}

#[derive(Clone, Debug)]
pub(crate) enum SkillManageScope {
    Global,
    Project { repo_path: String },
}

impl SkillManageScope {
    fn to_value(&self) -> Value {
        match self {
            Self::Global => json!({ "kind": "global" }),
            Self::Project { repo_path } => {
                json!({ "kind": "project", "repoPath": repo_path })
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SkillRunStartFailure {
    AlreadyRunning,
    InvalidNames,
    InvalidSource,
    InvalidScope,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct SkillRunStartOutcome {
    pub(crate) started: bool,
    pub(crate) reason: Option<SkillRunStartFailure>,
}

impl SkillRunStartOutcome {
    pub(crate) fn started() -> Self {
        Self {
            started: true,
            reason: None,
        }
    }

    pub(crate) fn failed(reason: SkillRunStartFailure) -> Self {
        Self {
            started: false,
            reason: Some(reason),
        }
    }
}

pub(crate) struct SkillRunStart {
    pub(crate) operation: SkillRunOperation,
    pub(crate) names: Vec<String>,
    pub(crate) source: Option<String>,
    pub(crate) scope: Option<SkillManageScope>,
}

/// Why: discovery is the shared scan behind `SkillsService.Discover`, the
/// freshness inventory, and the post-run failure rescan, so all three hand
/// over one typed request instead of re-deriving JSON input.
#[derive(Clone, Debug, Default)]
pub(crate) struct SkillDiscoverRequest {
    pub(crate) execution_host_id: Option<String>,
    pub(crate) wsl_runtime: bool,
    pub(crate) cwd: Option<String>,
}

const SKILL_FILE: &str = "SKILL.md";
const MAX_MARKDOWN_BYTES: usize = 256 * 1024;
const MAX_DIRECTORY_FILES: usize = 500;
const MAX_OUTPUT_CHARS: usize = 32_000;

#[derive(Clone)]
pub(crate) struct SkillsAuthority {
    hosts: HostRegistry,
    repositories: RepositoryAuthority,
    run: Arc<Mutex<SkillUpdateRun>>,
    cancel: Arc<Mutex<Option<watch::Sender<bool>>>>,
    events: broadcast::Sender<SkillUpdateRun>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub(crate) enum SkillUpdateRun {
    #[serde(rename = "idle")]
    Idle,
    #[serde(rename = "running")]
    Running {
        operation: String,
        names: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        source: Option<String>,
        started_at: i64,
        output: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        stopping: Option<bool>,
    },
    #[serde(rename = "success")]
    Success {
        operation: String,
        names: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        source: Option<String>,
        finished_at: i64,
        output: String,
    },
    #[serde(rename = "error")]
    Error {
        operation: String,
        names: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        source: Option<String>,
        finished_at: i64,
        output: String,
        failed_names: Vec<String>,
        kind: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        command: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        exit_code: Option<i32>,
    },
}

pub(crate) struct SkillRunFailure {
    detail: String,
    exit_code: Option<i32>,
    failed_names: Vec<String>,
    kind: &'static str,
}

impl SkillsAuthority {
    pub(crate) fn new(hosts: HostRegistry, repositories: RepositoryAuthority) -> Self {
        let (events, _) = broadcast::channel(32);
        Self {
            hosts,
            repositories,
            run: Arc::new(Mutex::new(SkillUpdateRun::Idle)),
            cancel: Arc::new(Mutex::new(None)),
            events,
        }
    }

    pub(crate) fn subscribe(&self) -> broadcast::Receiver<SkillUpdateRun> {
        self.events.subscribe()
    }

    pub(crate) async fn discover_for(
        &self,
        request: SkillDiscoverRequest,
    ) -> Result<Value, String> {
        if request
            .execution_host_id
            .as_deref()
            .is_some_and(|id| id.starts_with("ssh:"))
        {
            return Err("Skill discovery is no longer supported on remote hosts.".to_owned());
        }
        let host_id = request.execution_host_id.as_deref().unwrap_or("local");
        let host = self
            .hosts
            .execution_host(host_id)
            .await
            .map_err(|error| error.to_string())?;
        if host.kind() == HostKind::Ssh {
            return Err("Skill discovery is no longer supported on remote hosts.".to_owned());
        }
        if request.wsl_runtime && host.kind() != HostKind::Wsl {
            return Err("WSL skill discovery is unavailable for this host.".to_owned());
        }
        let filesystem = HostFilesystem::new(host.clone());
        let home = filesystem
            .home_directory()
            .await
            .map_err(|error| error.to_string())
            .and_then(|value| value.ok_or_else(|| "host_home_unavailable".to_owned()))?;
        let cwd = request
            .cwd
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        let repos = self
            .repositories
            .list()
            .await
            .map_err(|error| error.to_string())?
            .repos;
        let mut roots = discovery::home_roots(filesystem.paths(), &home);
        if let Some(cwd) = cwd.as_deref() {
            roots.extend(claude_plugins::discover(&filesystem, &home, cwd).await);
        }
        let mut repo_paths = BTreeSet::new();
        for repo in &repos {
            let repo_host = repo
                .get("executionHostId")
                .and_then(Value::as_str)
                .unwrap_or("local");
            if repo_host != host_id {
                continue;
            }
            if let Some(path) = repo.get("path").and_then(Value::as_str) {
                repo_paths.insert(path.to_owned());
            }
        }
        if let Some(path) = cwd.clone() {
            repo_paths.insert(path);
        } else if host.kind() == HostKind::Local
            && let Ok(path) = std::env::current_dir()
        {
            repo_paths.insert(path.to_string_lossy().into_owned());
        }
        let lock_sources = lockfile::read_sources(&filesystem, &home, repo_paths.iter()).await;
        for path in repo_paths {
            let id = stable_id(&path);
            let label = format!("Repo {}", filesystem.paths().basename(&path));
            roots.push(SourceRoot::new(
                format!("repo-agents-{id}"),
                format!("{label} .agents"),
                filesystem.paths().join(&[&path, ".agents", "skills"]),
                "repo",
                vec!["agent-skills"],
                None,
                format!("repo:{id}"),
            ));
            roots.push(SourceRoot::new(
                format!("repo-claude-{id}"),
                format!("{label} .claude"),
                filesystem.paths().join(&[&path, ".claude", "skills"]),
                "repo",
                vec!["claude"],
                Some("claude"),
                format!("repo:{id}"),
            ));
        }
        let mut sources = Vec::new();
        let mut candidates = Vec::new();
        let canonical_agents_root = filesystem
            .canonical_directory(&filesystem.paths().join(&[&home, ".agents", "skills"]))
            .await
            .ok();
        for root in roots {
            let exists = filesystem.exists(&root.path).await.unwrap_or(false);
            sources.push(json!({
                "id": root.id,
                "label": root.label,
                "path": root.path,
                "sourceKind": root.kind,
                "providers": root.providers,
                "owner": root.owner,
                "exists": exists,
                "skippedReason": (!exists).then_some("missing")
            }));
            if exists {
                candidates.extend(
                    discovery::scan_root(&filesystem, &root, canonical_agents_root.as_deref())
                        .await,
                );
            }
        }
        sources.sort_by(|left, right| {
            discovery::string_field(left, "label")
                .to_lowercase()
                .cmp(&discovery::string_field(right, "label").to_lowercase())
        });
        let mut skills = discovery::merge_candidates(candidates);
        lockfile::apply(&mut skills, &lock_sources);
        Ok(json!({"skills": skills, "sources": sources, "scannedAt": now()}))
    }

    pub(crate) async fn list_files(&self, directory: &str) -> Value {
        directory_access::list(&self.hosts, directory).await
    }

    pub(crate) async fn read_file(&self, directory: &str, relative: &str) -> Value {
        directory_access::read(&self.hosts, directory, relative).await
    }

    pub(crate) async fn freshness(&self) -> Result<Value, String> {
        let discovered = self.discover_for(SkillDiscoverRequest::default()).await?;
        freshness::inventory(&discovered).await
    }
}

fn stable_id(value: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(value.as_bytes());
    digest[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(0)
}
fn clamp_output(value: String) -> String {
    if value.chars().count() <= MAX_OUTPUT_CHARS {
        value
    } else {
        value
            .chars()
            .skip(value.chars().count() - MAX_OUTPUT_CHARS)
            .collect()
    }
}
