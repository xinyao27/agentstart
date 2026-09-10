use std::collections::HashSet;

use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::hosts::{HostFilesystem, HostFilesystemError};

const HOOKS_FILE: &str = "agentstart.yaml";
const MAX_HOOKS_BYTES: usize = 1024 * 1024;

pub(crate) struct RepoHooksInspection {
    pub(crate) setup_command: Option<String>,
    pub(crate) setup_run_policy: String,
    pub(crate) source: Option<&'static str>,
    pub(crate) setup_trust: Option<RepoSetupTrust>,
}

pub(crate) struct RepoSetupTrust {
    pub(crate) content_hash: String,
    pub(crate) script_content: String,
}

#[derive(Clone)]
pub(crate) struct WorktreeDefaultTab {
    pub(crate) color: Option<String>,
    pub(crate) command: Option<String>,
    pub(crate) title: Option<String>,
}

pub(crate) struct WorktreeHooksPlan {
    pub(crate) default_tabs: Vec<WorktreeDefaultTab>,
    pub(crate) run_default_tab_commands: bool,
    pub(crate) run_setup: bool,
}

impl WorktreeHooksPlan {
    pub(crate) fn empty() -> Self {
        Self {
            default_tabs: Vec::new(),
            run_default_tab_commands: false,
            run_setup: false,
        }
    }
}

#[derive(Debug, Error)]
pub(crate) enum WorktreeHooksPlanError {
    #[error("Setup decision required for this repository")]
    DecisionRequired,
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
}

#[derive(Clone, Copy)]
pub(crate) enum WorktreeSetupDecision {
    Inherit,
    Run,
    Skip,
}

pub(crate) async fn inspect_strict(
    repo: &Value,
    filesystem: &HostFilesystem,
) -> Result<RepoHooksInspection, HostFilesystemError> {
    let path = repo_path(repo, filesystem, HOOKS_FILE);
    let content = filesystem.read_text(&path, MAX_HOOKS_BYTES).await?;
    let shared_hooks = content.as_deref().and_then(parse_hooks);
    let hooks = effective_hooks(repo, shared_hooks.as_ref());
    let source = if content.is_some() {
        Some("agentstart.yaml")
    } else if hooks.is_some() {
        Some("legacy")
    } else {
        None
    };
    let setup_command = hooks
        .as_ref()
        .and_then(Value::as_object)
        .and_then(|hooks| hooks.get("scripts"))
        .and_then(Value::as_object)
        .and_then(|scripts| scripts.get("setup"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let setup_trust = if allows_shared_trust(repo) {
        shared_hooks
            .as_ref()
            .and_then(trust_content)
            .filter(|content| !super::ecmascript::trim(content).is_empty())
            .map(|script_content| RepoSetupTrust {
                content_hash: format!("{:x}", Sha256::digest(script_content.as_bytes())),
                script_content,
            })
    } else {
        None
    };
    Ok(RepoHooksInspection {
        setup_command,
        setup_run_policy: setup_run_policy(repo).to_owned(),
        source,
        setup_trust,
    })
}

pub(crate) async fn plan_worktree_create(
    repo: &Value,
    filesystem: &HostFilesystem,
    worktree_path: &str,
    decision: WorktreeSetupDecision,
) -> Result<WorktreeHooksPlan, WorktreeHooksPlanError> {
    let path = filesystem.paths().join(&[worktree_path, HOOKS_FILE]);
    let shared_hooks = filesystem
        .read_text(&path, MAX_HOOKS_BYTES)
        .await?
        .as_deref()
        .and_then(parse_hooks);
    let effective = effective_hooks(repo, shared_hooks.as_ref());
    let has_setup = effective
        .as_ref()
        .and_then(Value::as_object)
        .and_then(|hooks| hooks.get("scripts"))
        .and_then(Value::as_object)
        .and_then(|scripts| scripts.get("setup"))
        .and_then(Value::as_str)
        .is_some();
    let default_tabs = shared_hooks.as_ref().map(default_tabs).unwrap_or_default();
    let has_default_tab_commands = default_tabs.iter().any(|tab| tab.command.is_some());
    let can_run_shared_commands = command_source_policy(
        repo,
        repo.get("hookSettings")
            .and_then(Value::as_object)
            .and_then(|settings| settings.get("scripts"))
            .and_then(Value::as_object)
            .and_then(|scripts| scripts.get("setup"))
            .and_then(Value::as_str)
            .is_some_and(|command| !super::ecmascript::trim(command).is_empty()),
    ) != "local-only";
    let resolved_decision = resolve_setup_decision(repo, decision);
    let run_setup = if has_setup {
        resolved_decision.ok_or(WorktreeHooksPlanError::DecisionRequired)?
    } else {
        false
    };
    let run_default_tab_commands =
        has_default_tab_commands && can_run_shared_commands && resolved_decision.unwrap_or(false);
    Ok(WorktreeHooksPlan {
        default_tabs,
        run_default_tab_commands,
        run_setup,
    })
}

pub(crate) fn setup_decision(value: Option<&str>) -> Option<WorktreeSetupDecision> {
    match value {
        None | Some("inherit") => Some(WorktreeSetupDecision::Inherit),
        Some("run") => Some(WorktreeSetupDecision::Run),
        Some("skip") => Some(WorktreeSetupDecision::Skip),
        Some(_) => None,
    }
}

fn resolve_setup_decision(repo: &Value, decision: WorktreeSetupDecision) -> Option<bool> {
    match decision {
        WorktreeSetupDecision::Run => Some(true),
        WorktreeSetupDecision::Skip => Some(false),
        WorktreeSetupDecision::Inherit => match setup_run_policy(repo) {
            "run-by-default" => Some(true),
            "skip-by-default" => Some(false),
            "ask" => None,
            _ => None,
        },
    }
}

pub(super) async fn inspect(
    repo: &Value,
    filesystem: &HostFilesystem,
) -> Result<Value, HostFilesystemError> {
    let path = repo_path(repo, filesystem, HOOKS_FILE);
    let has_hooks_file = filesystem.exists(&path).await.unwrap_or(false);
    let content = if has_hooks_file {
        filesystem
            .read_text(&path, MAX_HOOKS_BYTES)
            .await
            .ok()
            .flatten()
    } else {
        None
    };
    let shared_hooks = content.as_deref().and_then(parse_hooks);
    let hooks = effective_hooks(repo, shared_hooks.as_ref());
    let source = if has_hooks_file {
        Some("agentstart.yaml")
    } else if hooks.is_some() {
        Some("legacy")
    } else {
        None
    };
    let mut output = Map::new();
    output.insert("hasHooksFile".to_owned(), json!(has_hooks_file));
    output.insert("hooks".to_owned(), hooks.unwrap_or(Value::Null));
    output.insert("setupRunPolicy".to_owned(), json!(setup_run_policy(repo)));
    output.insert("source".to_owned(), json!(source));
    if allows_shared_trust(repo)
        && let Some(content) = shared_hooks.as_ref().and_then(trust_content)
        && !super::ecmascript::trim(&content).is_empty()
    {
        output.insert(
            "setupTrust".to_owned(),
            json!({
                "contentHash": format!("{:x}", Sha256::digest(content.as_bytes())),
                "scriptContent": content,
            }),
        );
    }
    Ok(Value::Object(output))
}

pub(super) async fn check(
    repo: &Value,
    filesystem: &HostFilesystem,
) -> Result<Value, HostFilesystemError> {
    if repo.get("kind").and_then(Value::as_str) == Some("folder") {
        return Ok(json!({
            "status":"ok", "hasHooks":false, "hooks":null, "mayNeedUpdate":false
        }));
    }
    let path = repo_path(repo, filesystem, HOOKS_FILE);
    let has_hooks = filesystem.exists(&path).await.unwrap_or(false);
    let content = if has_hooks {
        filesystem
            .read_text(&path, MAX_HOOKS_BYTES)
            .await
            .ok()
            .flatten()
    } else {
        None
    };
    let hooks = content.as_deref().and_then(parse_hooks);
    let may_need_update = content
        .as_deref()
        .is_some_and(|content| hooks.is_none() && has_unrecognized_top_level_key(content));
    Ok(json!({
        "status":"ok",
        "hasHooks":has_hooks,
        "hooks":hooks,
        "mayNeedUpdate":may_need_update,
    }))
}

fn parse_hooks(content: &str) -> Option<Value> {
    let value = serde_saphyr::from_str::<Value>(content).ok()?;
    let object = value.as_object()?;
    let scripts = object.get("scripts").and_then(Value::as_object);
    let setup = trimmed_string(scripts.and_then(|scripts| scripts.get("setup")));
    let archive = trimmed_string(scripts.and_then(|scripts| scripts.get("archive")));
    let tabs = object
        .get("defaultTabs")
        .and_then(Value::as_array)
        .map(|tabs| tabs.iter().filter_map(normalize_tab).collect::<Vec<_>>())
        .unwrap_or_default();
    let shared_directories = object
        .get("worktree")
        .and_then(Value::as_object)
        .and_then(|worktree| worktree.get("sharedDirectories"))
        .map(normalize_shared_directories)
        .unwrap_or_default();
    if setup.is_none() && archive.is_none() && tabs.is_empty() && shared_directories.is_empty() {
        return None;
    }
    let mut normalized_scripts = Map::new();
    if let Some(setup) = setup {
        normalized_scripts.insert("setup".to_owned(), json!(setup));
    }
    if let Some(archive) = archive {
        normalized_scripts.insert("archive".to_owned(), json!(archive));
    }
    let mut hooks = Map::new();
    hooks.insert("scripts".to_owned(), Value::Object(normalized_scripts));
    if !tabs.is_empty() {
        hooks.insert("defaultTabs".to_owned(), Value::Array(tabs));
    }
    if !shared_directories.is_empty() {
        hooks.insert(
            "worktree".to_owned(),
            json!({ "sharedDirectories": shared_directories }),
        );
    }
    Some(Value::Object(hooks))
}

fn normalize_tab(value: &Value) -> Option<Value> {
    let tab = value.as_object()?;
    let mut output = Map::new();
    if let Some(title) = trimmed_string(tab.get("title")) {
        output.insert("title".to_owned(), json!(title));
    }
    if let Some(color) = trimmed_string(tab.get("color"))
        && valid_color(&color)
    {
        output.insert("color".to_owned(), json!(color));
    }
    if let Some(command) = trimmed_string(tab.get("command")) {
        output.insert("command".to_owned(), json!(command));
    }
    (!output.is_empty()).then_some(Value::Object(output))
}

fn default_tabs(hooks: &Value) -> Vec<WorktreeDefaultTab> {
    hooks
        .get("defaultTabs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|value| {
            let tab = value.as_object()?;
            Some(WorktreeDefaultTab {
                color: tab.get("color").and_then(Value::as_str).map(str::to_owned),
                command: tab
                    .get("command")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                title: tab.get("title").and_then(Value::as_str).map(str::to_owned),
            })
        })
        .collect()
}

fn normalize_shared_directories(value: &Value) -> Vec<String> {
    let Some(values) = value.as_array() else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut output = Vec::new();
    for value in values.iter().take(100) {
        let Some(raw) = trimmed_string(Some(value)) else {
            continue;
        };
        let mut normalized = raw.replace('\\', "/");
        if let Some(rest) = normalized.strip_prefix("./") {
            normalized = rest.to_owned();
        }
        normalized.truncate(normalized.trim_end_matches('/').len());
        let parts = normalized.split('/').collect::<Vec<_>>();
        let drive_absolute = normalized.as_bytes().get(1) == Some(&b':')
            && normalized
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_alphabetic);
        if normalized.is_empty()
            || normalized.starts_with('/')
            || drive_absolute
            || parts
                .iter()
                .any(|part| matches!(*part, "" | "." | ".." | ".git"))
            || !seen.insert(normalized.clone())
        {
            continue;
        }
        output.push(normalized);
    }
    output
}

fn trimmed_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(super::ecmascript::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn valid_color(value: &str) -> bool {
    value.strip_prefix('#').is_some_and(|digits| {
        matches!(digits.len(), 3 | 6) && digits.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn effective_hooks(repo: &Value, shared: Option<&Value>) -> Option<Value> {
    let shared_scripts = shared
        .and_then(Value::as_object)
        .and_then(|hooks| hooks.get("scripts"))
        .and_then(Value::as_object);
    let local_scripts = repo
        .get("hookSettings")
        .and_then(Value::as_object)
        .and_then(|settings| settings.get("scripts"))
        .and_then(Value::as_object);
    let setup = effective_script(
        shared_scripts,
        local_scripts,
        "setup",
        command_source_policy(repo, script(local_scripts, "setup").is_some()),
    );
    let archive = effective_script(
        shared_scripts,
        local_scripts,
        "archive",
        command_source_policy(repo, script(local_scripts, "archive").is_some()),
    );
    if setup.is_none() && archive.is_none() {
        return None;
    }
    Some(json!({
        "scripts": {
            "setup": setup,
            "archive": archive,
        }
    }))
}

fn effective_script(
    shared: Option<&Map<String, Value>>,
    local: Option<&Map<String, Value>>,
    field: &str,
    policy: &str,
) -> Option<String> {
    let shared = script(shared, field);
    let local = script(local, field);
    match policy {
        "local-only" => local,
        "run-both" => {
            let combined = [shared, local].into_iter().flatten().collect::<Vec<_>>();
            (!combined.is_empty()).then(|| combined.join("\n"))
        }
        _ => shared,
    }
}

fn script(source: Option<&Map<String, Value>>, field: &str) -> Option<String> {
    source
        .and_then(|source| source.get(field))
        .and_then(Value::as_str)
        .map(super::ecmascript::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub(crate) fn command_source_policy(repo: &Value, has_local_script: bool) -> &str {
    let policy = repo
        .get("hookSettings")
        .and_then(Value::as_object)
        .and_then(|settings| settings.get("commandSourcePolicy"))
        .and_then(Value::as_str);
    match policy {
        Some(policy @ ("local-only" | "run-both" | "shared-only")) => policy,
        None if has_local_script => "local-only",
        _ => "shared-only",
    }
}

fn allows_shared_trust(repo: &Value) -> bool {
    repo.get("hookSettings")
        .and_then(Value::as_object)
        .and_then(|settings| settings.get("commandSourcePolicy"))
        .and_then(Value::as_str)
        != Some("local-only")
}

fn setup_run_policy(repo: &Value) -> &str {
    repo.get("hookSettings")
        .and_then(Value::as_object)
        .and_then(|settings| settings.get("setupRunPolicy"))
        .and_then(Value::as_str)
        .unwrap_or("run-by-default")
}

fn trust_content(hooks: &Value) -> Option<String> {
    let hooks = hooks.as_object()?;
    let setup = hooks
        .get("scripts")
        .and_then(Value::as_object)
        .and_then(|scripts| scripts.get("setup"))
        .and_then(Value::as_str)
        .map(super::ecmascript::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let commands = hooks
        .get("defaultTabs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(index, tab)| {
            let tab = tab.as_object()?;
            let command = super::ecmascript::trim(tab.get("command")?.as_str()?);
            if command.is_empty() {
                return None;
            }
            let title = tab
                .get("title")
                .and_then(Value::as_str)
                .map(|title| format!(" {title}"))
                .unwrap_or_default();
            Some(format!("# defaultTabs[{}]{title}\n{command}", index + 1))
        });
    let content = setup.into_iter().chain(commands).collect::<Vec<_>>();
    (!content.is_empty()).then(|| content.join("\n\n"))
}

fn has_unrecognized_top_level_key(content: &str) -> bool {
    content.lines().any(|line| {
        let line = line.trim_end_matches('\r');
        if line.starts_with(char::is_whitespace) {
            return false;
        }
        let Some((key, rest)) = line.split_once(':') else {
            return false;
        };
        if !rest.is_empty() && !rest.starts_with(char::is_whitespace) {
            return false;
        }
        !matches!(key, "scripts" | "defaultTabs" | "worktree")
            && key
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_alphabetic())
            && key.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '_' | '-')
            })
    })
}

fn repo_path(repo: &Value, filesystem: &HostFilesystem, relative: &str) -> String {
    let root = repo.get("path").and_then(Value::as_str).unwrap_or_default();
    filesystem.paths().join(&[root, relative])
}
