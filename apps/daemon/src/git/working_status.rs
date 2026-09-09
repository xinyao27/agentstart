use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::{Map, Value, json};

use crate::hosts::{
    HostCommandOutputObserver, HostCommandOutputStream, HostCommandStreamControl, HostFilesystem,
};

use super::runner::{GitError, GitRunOptions};
use super::scope::{GitAuthority, GitAuthorityError, GitScope};
use super::status::detect_conflict;

const STATUS_LIMIT: usize = 10_000;
const STATUS_OUTPUT_LIMIT_BYTES: usize = 64 * 1_024 * 1_024;

impl GitAuthority {
    pub(crate) async fn working_status(
        &self,
        worktree: &str,
        include_ignored: bool,
        bypass_upstream_negative_cache: bool,
        reuse_line_stats: bool,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        status_for_scope(
            self,
            &scope,
            include_ignored,
            bypass_upstream_negative_cache,
            reuse_line_stats,
        )
        .await
    }

    pub(crate) async fn submodule_status(
        &self,
        worktree: &str,
        submodule_path: &str,
        area: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        validate_submodule_path(&scope, submodule_path)?;
        let filesystem = HostFilesystem::new(scope.host.clone());
        let path = filesystem
            .paths()
            .resolve(&scope.runner.cwd, &[submodule_path]);
        let inner = GitScope {
            host: scope.host.clone(),
            host_id: scope.host_id.clone(),
            runner: scope.runner.for_cwd(scope.host, path),
        };
        let mut result = status_for_scope(self, &inner, false, false, false).await?;
        if area == "staged"
            && let Some(entries) = result.get_mut("entries")
        {
            *entries = Value::Array(
                entries
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|entry| entry.get("area").and_then(Value::as_str) == Some("staged"))
                    .cloned()
                    .collect(),
            );
        }
        Ok(result)
    }
}

async fn status_for_scope(
    authority: &GitAuthority,
    scope: &GitScope,
    include_ignored: bool,
    bypass_upstream_negative_cache: bool,
    reuse_line_stats: bool,
) -> Result<Value, GitAuthorityError> {
    let mut args = strings([
        "-c",
        "core.quotePath=false",
        "status",
        "--porcelain=v2",
        "--branch",
        "--untracked-files=all",
    ]);
    if include_ignored {
        args.push("--ignored=matching".to_owned());
    }
    let observer = Arc::new(StatusObserver::new());
    let scan = scope.runner.stream(
        args,
        GitRunOptions {
            max_output_bytes: STATUS_OUTPUT_LIMIT_BYTES,
            timeout_ms: Some(120_000),
        },
        observer.clone(),
    );
    let (conflict_operation, output) = tokio::join!(detect_conflict(&scope.runner), scan);
    let did_hit_limit = matches!(output, Err(GitError::Stopped));
    let status_succeeded =
        did_hit_limit || output.as_ref().is_ok_and(|output| output.exit_code == 0);
    if !status_succeeded {
        return Ok(json!({
            "entries": [],
            "conflictOperation": conflict_operation
        }));
    }
    let mut parser = observer.finish(!did_hit_limit);
    if !did_hit_limit {
        for line in std::mem::take(&mut parser.unmerged) {
            parser.unmerged_entry(scope, &line).await;
        }
    }
    parser.entries.truncate(STATUS_LIMIT);
    if !did_hit_limit {
        super::line_stats::attach(
            authority,
            scope,
            parser.head.as_deref(),
            &mut parser.entries,
            reuse_line_stats,
        )
        .await;
    }
    let upstream_status = super::upstream::status_for_poll(
        authority,
        scope,
        parser.branch.as_deref().unwrap_or_default(),
        parser.upstream.as_deref(),
        bypass_upstream_negative_cache,
    )
    .await
    .unwrap_or_else(|| parser.upstream_status());
    let mut result = Map::from_iter([
        ("entries".to_owned(), Value::Array(parser.entries)),
        (
            "conflictOperation".to_owned(),
            Value::String(conflict_operation.to_owned()),
        ),
        ("upstreamStatus".to_owned(), upstream_status),
    ]);
    if let Some(head) = parser.head {
        result.insert("head".to_owned(), Value::String(head));
    }
    if let Some(branch) = parser.branch {
        result.insert("branch".to_owned(), Value::String(branch));
    }
    if include_ignored {
        result.insert("ignoredPaths".to_owned(), Value::Array(parser.ignored));
    }
    if did_hit_limit {
        result.insert("didHitLimit".to_owned(), Value::Bool(true));
        result.insert("statusLength".to_owned(), json!(parser.status_length));
    }
    Ok(Value::Object(result))
}

#[derive(Default)]
struct StatusParser {
    ahead: u64,
    behind: u64,
    branch: Option<String>,
    entries: Vec<Value>,
    head: Option<String>,
    ignored: Vec<Value>,
    status_length: usize,
    unmerged: Vec<String>,
    upstream: Option<String>,
}

impl StatusParser {
    fn parse(&mut self, line: &str) {
        if let Some(value) = line.strip_prefix("# branch.oid ") {
            self.head = Some(value.trim().to_owned());
        } else if let Some(value) = line.strip_prefix("# branch.head ") {
            let value = value.trim();
            self.branch = (value != "(detached)").then(|| format!("refs/heads/{value}"));
        } else if let Some(value) = line.strip_prefix("# branch.upstream ") {
            let value = value.trim();
            self.upstream = (!value.is_empty()).then(|| value.to_owned());
        } else if let Some(value) = line.strip_prefix("# branch.ab ") {
            let mut values = value.split_whitespace();
            self.ahead = values
                .next()
                .and_then(|value| value.strip_prefix('+'))
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
            self.behind = values
                .next()
                .and_then(|value| value.strip_prefix('-'))
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            self.changed(line);
        } else if let Some(path) = line.strip_prefix("? ") {
            self.push(json!({ "path": path, "status": "untracked", "area": "untracked" }));
        } else if let Some(path) = line.strip_prefix("! ") {
            self.ignored.push(Value::String(path.to_owned()));
        } else if line.starts_with("u ") {
            self.unmerged.push(line.to_owned());
        }
    }

    fn changed(&mut self, line: &str) {
        let parts = line.split(' ').collect::<Vec<_>>();
        let xy = parts.get(1).copied().unwrap_or("..").as_bytes();
        let index = char::from(*xy.first().unwrap_or(&b'.'));
        let worktree = char::from(*xy.get(1).unwrap_or(&b'.'));
        let submodule = parts.get(2).copied().unwrap_or("");
        let (path, old_path) = if line.starts_with("2 ") {
            let mut tab = line.split('\t');
            let path = tab
                .next()
                .unwrap_or_default()
                .split(' ')
                .skip(9)
                .collect::<Vec<_>>()
                .join(" ");
            (path, tab.collect::<Vec<_>>().join("\t"))
        } else {
            (
                parts.iter().skip(8).copied().collect::<Vec<_>>().join(" "),
                String::new(),
            )
        };
        if index != '.' {
            self.push(changed_entry(&path, &old_path, index, "staged", submodule));
        }
        if worktree != '.' {
            self.push(changed_entry(
                &path, &old_path, worktree, "unstaged", submodule,
            ));
        }
    }

    async fn unmerged_entry(&mut self, scope: &GitScope, line: &str) {
        let parts = line.split(' ').collect::<Vec<_>>();
        let xy = parts.get(1).copied().unwrap_or_default();
        let path = parts.iter().skip(10).copied().collect::<Vec<_>>().join(" ");
        if path.is_empty()
            || parts
                .get(3..=5)
                .is_some_and(|modes| modes.contains(&"160000"))
        {
            return;
        }
        let Some(kind) = conflict_kind(xy) else {
            return;
        };
        let filesystem = HostFilesystem::new(scope.host.clone());
        let absolute = filesystem.paths().resolve(&scope.runner.cwd, &[&path]);
        let exists = filesystem.exists(&absolute).await.unwrap_or(true);
        let status = if matches!(kind, "both_deleted") || !exists {
            "deleted"
        } else {
            "modified"
        };
        self.push(json!({
            "path": path, "area": "unstaged", "status": status,
            "conflictKind": kind, "conflictStatus": "unresolved"
        }));
    }

    fn push(&mut self, value: Value) {
        self.status_length = self.status_length.saturating_add(1);
        if self.entries.len() < STATUS_LIMIT.saturating_add(1) {
            self.entries.push(value);
        }
    }

    fn upstream_status(&self) -> Value {
        self.upstream.as_ref().map_or_else(
            || json!({ "hasUpstream": false, "ahead": 0, "behind": 0 }),
            |upstream| json!({ "hasUpstream": true, "upstreamName": upstream, "ahead": self.ahead, "behind": self.behind }),
        )
    }
}

struct StatusObserver {
    state: Mutex<StatusStreamState>,
}

#[derive(Default)]
struct StatusStreamState {
    carry: Vec<u8>,
    parser: StatusParser,
}

impl StatusObserver {
    fn new() -> Self {
        Self {
            state: Mutex::new(StatusStreamState::default()),
        }
    }

    fn finish(&self, flush_carry: bool) -> StatusParser {
        let mut state = lock(&self.state);
        if flush_carry && !state.carry.is_empty() {
            let line = String::from_utf8_lossy(&state.carry)
                .trim_end_matches('\r')
                .to_owned();
            state.parser.parse(&line);
        }
        state.carry.clear();
        std::mem::take(&mut state.parser)
    }
}

impl HostCommandOutputObserver for StatusObserver {
    fn observe(&self, stream: HostCommandOutputStream, bytes: &[u8]) -> HostCommandStreamControl {
        if stream == HostCommandOutputStream::Stderr {
            return HostCommandStreamControl::Continue;
        }
        let mut state = lock(&self.state);
        state.carry.extend_from_slice(bytes);
        while let Some(index) = state.carry.iter().position(|byte| *byte == b'\n') {
            let mut line = state.carry.drain(..=index).collect::<Vec<_>>();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            state.parser.parse(&String::from_utf8_lossy(&line));
            if state.parser.status_length > STATUS_LIMIT {
                state.carry.clear();
                return HostCommandStreamControl::Stop;
            }
        }
        HostCommandStreamControl::Continue
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn changed_entry(path: &str, old_path: &str, status: char, area: &str, submodule: &str) -> Value {
    let mut entry = Map::from_iter([
        ("path".to_owned(), Value::String(path.to_owned())),
        (
            "status".to_owned(),
            Value::String(status_name(status).to_owned()),
        ),
        ("area".to_owned(), Value::String(area.to_owned())),
    ]);
    if !old_path.is_empty() {
        entry.insert("oldPath".to_owned(), Value::String(old_path.to_owned()));
    }
    if submodule.starts_with('S') {
        entry.insert("submodule".to_owned(), json!({
            "commitChanged": submodule.as_bytes().get(1) == Some(&b'C') || (submodule == "S..." && status == 'M'),
            "trackedChanges": submodule.as_bytes().get(2) == Some(&b'M'),
            "untrackedChanges": submodule.as_bytes().get(3) == Some(&b'U')
        }));
    }
    Value::Object(entry)
}

fn status_name(status: char) -> &'static str {
    match status {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        _ => "modified",
    }
}

fn conflict_kind(xy: &str) -> Option<&'static str> {
    match xy {
        "UU" => Some("both_modified"),
        "AA" => Some("both_added"),
        "DD" => Some("both_deleted"),
        "AU" => Some("added_by_us"),
        "UA" => Some("added_by_them"),
        "DU" => Some("deleted_by_us"),
        "UD" => Some("deleted_by_them"),
        _ => None,
    }
}

fn validate_submodule_path(scope: &GitScope, path: &str) -> Result<(), GitAuthorityError> {
    let filesystem = HostFilesystem::new(scope.host.clone());
    if path.is_empty()
        || path.contains('\0')
        || filesystem.paths().is_absolute(path)
        || path.split(['/', '\\']).any(|segment| segment == "..")
    {
        Err(GitAuthorityError::Operation(
            "Access denied: invalid submodule path".to_owned(),
        ))
    } else {
        Ok(())
    }
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}
